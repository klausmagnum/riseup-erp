import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarLoteDFe, CSTAT, type SefazEnvironment } from "./distribuicaoDFe";
import { normalizarDocumentoCTe } from "./parseCTe";
import { carregarCertificado, type RegistroCertificado } from "./certificado";
import { ensureDocumentoFolder, uploadTextFile } from "../googleDriveServer";
import type { ClienteSincronizavel, ResultadoSincronizacao } from "./sincronizarCliente";

/**
 * Captura de CT-e pela distribuição de DF-e do CT-e.
 *
 * Mesmo protocolo da NF-e — distDFeInt paginado por NSU, docZip em base64 e
 * gzip — em outro serviço, com fila de NSU própria. Por isso a origem gravada
 * é outra: é ela que separa as filas na deduplicação.
 */

export const ORIGEM_CTE = "SEFAZ/CTeDistribuicaoDFe";

/** A SEFAZ derruba o CNPJ por uma hora quando ele consulta repetidamente sem
 *  ter documento novo. Mesma janela da NF-e. */
const JANELA_BLOQUEIO_MS = 61 * 60 * 1000;

export interface ClienteSincronizavelCTe extends Omit<ClienteSincronizavel, "ultimo_nsu_nfe_recebida"> {
  ultimo_nsu_cte_recebida: number | null;
}

export async function sincronizarClienteCTe(params: {
  supabase: SupabaseClient;
  cliente: ClienteSincronizavelCTe;
  certificado: RegistroCertificado;
  ambiente?: SefazEnvironment;
  deadline: number;
  maxLotes?: number;
}): Promise<ResultadoSincronizacao> {
  const { supabase, cliente } = params;
  const ambiente = params.ambiente ?? "producao";
  const maxLotes = params.maxLotes ?? 20;

  const base: ResultadoSincronizacao = {
    clienteId: cliente.id,
    cliente: cliente.razao_social,
    status: "Erro",
    encontrados: 0,
    importados: 0,
    erros: 0,
    ultimoNsu: String(cliente.ultimo_nsu_cte_recebida ?? 0),
    mensagem: "",
  };

  const cnpj = (cliente.identificacao ?? "").replace(/\D/g, "");
  if (cnpj.length !== 14) {
    const mensagem = "Cliente sem CNPJ valido (a distribuicao de DF-e nao atende CPF).";
    await registrarEstado(supabase, cliente.id, base.ultimoNsu, "Erro", mensagem, false);
    return { ...base, mensagem };
  }

  let credenciais;
  try {
    credenciais = await carregarCertificado(params.certificado);
  } catch (error) {
    const mensagem =
      error instanceof Error ? error.message : "Falha ao carregar certificado.";
    await registrarEstado(supabase, cliente.id, base.ultimoNsu, "Erro", mensagem, false);
    return { ...base, mensagem };
  }

  let ultNSU = String(cliente.ultimo_nsu_cte_recebida ?? 0);
  let encontrados = 0;
  let importados = 0;
  let erros = 0;
  let lotes = 0;
  let interrompido = false;

  try {
    while (lotes < maxLotes) {
      if (Date.now() > params.deadline) {
        interrompido = true;
        break;
      }

      const lote = await buscarLoteDFe({
        cnpj,
        uf: cliente.estado ?? "",
        ultNSU,
        certificado: credenciais,
        ambiente,
        servico: "cte",
      });

      lotes += 1;
      const motivo = `${lote.cStat} - ${lote.xMotivo}`;

      if (lote.cStat === CSTAT.CONSUMO_INDEVIDO) {
        // Intervalo pedido, não falha: acontece quando não há documento novo.
        await registrarEstado(supabase, cliente.id, ultNSU, "Bloqueado", motivo, true);
        return {
          ...base,
          status: "Erro",
          encontrados,
          importados,
          erros,
          ultimoNsu: ultNSU,
          mensagem: `SEFAZ bloqueou por consumo indevido. ${lote.xMotivo}`,
          bloqueadoAte: new Date(Date.now() + JANELA_BLOQUEIO_MS),
        };
      }

      if (lote.cStat === CSTAT.NENHUM_DOCUMENTO) {
        // A SEFAZ pode pular faixas de NSU; avançar mesmo assim.
        if (lote.ultNSU && lote.ultNSU !== ultNSU) ultNSU = lote.ultNSU;
        break;
      }

      if (lote.cStat !== CSTAT.LOTE_ENCONTRADO) {
        await registrarEstado(supabase, cliente.id, ultNSU, "Erro", motivo, false);
        return {
          ...base,
          encontrados,
          importados,
          erros,
          ultimoNsu: ultNSU,
          mensagem: `SEFAZ retornou ${motivo}`,
        };
      }

      encontrados += lote.documentos.length;

      for (const doc of lote.documentos) {
        if (Date.now() > params.deadline) {
          interrompido = true;
          break;
        }

        try {
          const gravado = await gravarDocumento(supabase, cliente, doc, cnpj);
          if (gravado) importados += 1;
          ultNSU = doc.nsu || ultNSU;
        } catch (error) {
          erros += 1;
          console.error(
            `[cte] cliente=${cliente.id} nsu=${doc.nsu} falhou:`,
            error instanceof Error ? error.message : error
          );
        }
      }

      if (interrompido) break;

      ultNSU = lote.ultNSU || ultNSU;

      // Fim da fila.
      if (Number(lote.ultNSU) >= Number(lote.maxNSU)) break;
    }
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido";
    await registrarEstado(supabase, cliente.id, ultNSU, "Erro", mensagem, false);
    return { ...base, encontrados, importados, erros, ultimoNsu: ultNSU, mensagem };
  }

  const status: ResultadoSincronizacao["status"] = interrompido
    ? "Interrompido"
    : encontrados === 0
      ? "Sem novidades"
      : "Sucesso";

  const mensagem = interrompido
    ? `Parcial: ${importados} importados, retomar do NSU ${ultNSU}.`
    : encontrados === 0
      ? "Nenhum documento novo."
      : `${importados} de ${encontrados} documentos importados.`;

  await registrarEstado(supabase, cliente.id, ultNSU, status, mensagem, encontrados === 0);

  return { ...base, status, encontrados, importados, erros, ultimoNsu: ultNSU, mensagem };
}

/** Eventos repetem a chave do CT-e a que se referem, então o NSU é o que os
 *  distingue no Drive. */
function arquivoDoDocumento(doc: {
  chave: string;
  nsu: string;
  tipo: string;
  completude: "resumo" | "completo" | "evento";
}) {
  const base = doc.chave || `${doc.tipo}-nsu${doc.nsu}`;
  if (doc.completude === "completo") return `${base}.xml`;
  if (doc.completude === "resumo") return `${base}-resumo.xml`;
  return `${base}-evento-nsu${doc.nsu}.xml`;
}

async function gravarDocumento(
  supabase: SupabaseClient,
  cliente: ClienteSincronizavelCTe,
  doc: { nsu: string; schema: string; xml: string },
  cnpjCliente: string
): Promise<boolean> {
  const normalizado = await normalizarDocumentoCTe(doc, {
    cnpjCliente,
    nomeCliente: cliente.razao_social,
  });

  if (!normalizado) return false;

  const jaExiste = await supabase
    .from("documentos_fiscais")
    .select("id")
    .eq("cliente_id", cliente.id)
    .eq("origem", ORIGEM_CTE)
    .eq("nsu", doc.nsu)
    .maybeSingle();

  if (jaExiste.data) return false;

  const referencia = normalizado.data_emissao ?? new Date().toISOString().slice(0, 10);
  const [ano, mes] = referencia.split("-");

  let driveFileId: string | null = null;
  let xmlPath: string | null = null;

  try {
    const pasta = await ensureDocumentoFolder({
      nomeCliente: cliente.razao_social,
      tipoDocumento: normalizado.tipo_documento,
      ano,
      mes,
    });

    const upload = await uploadTextFile({
      nome: arquivoDoDocumento({
        chave: normalizado.chave_acesso,
        nsu: doc.nsu,
        tipo: normalizado.tipo_documento,
        completude: normalizado.completude,
      }),
      conteudo: doc.xml,
      parentFolderId: pasta,
    });

    driveFileId = upload.id;
    xmlPath = upload.webViewLink;
  } catch (error) {
    console.error(
      `[drive] falha ao arquivar CT-e nsu=${doc.nsu} do cliente ${cliente.id}:`,
      error instanceof Error ? error.message : error
    );
  }

  const { data: inserido, error } = await supabase
    .from("documentos_fiscais")
    .insert({
      cliente_id: cliente.id,
      tipo_documento: normalizado.tipo_documento,
      numero: normalizado.numero,
      serie: normalizado.serie,
      chave_acesso: normalizado.chave_acesso,
      data_emissao: normalizado.data_emissao,
      valor_total: normalizado.valor_total,
      emitente_cnpj_cpf: normalizado.emitente_cnpj_cpf,
      emitente_nome: normalizado.emitente_nome,
      destinatario_cnpj_cpf: normalizado.destinatario_cnpj_cpf,
      destinatario_nome: normalizado.destinatario_nome,
      municipio: normalizado.municipio,
      uf: normalizado.uf,
      status_documento: normalizado.status_documento,
      origem: ORIGEM_CTE,
      nsu: doc.nsu,
      completude: normalizado.completude,
      drive_file_id: driveFileId,
      xml_storage_path: xmlPath,
      json_dados: normalizado.json_dados,
      possui_pendencia: !driveFileId || normalizado.completude === "resumo",
      status_processamento: "Importado",
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return false;
    throw new Error(`Falha ao gravar CT-e NSU ${doc.nsu}: ${error.message}`);
  }

  if (!driveFileId && inserido) {
    await supabase.from("documentos_fiscais_pendencias").insert({
      documento_fiscal_id: inserido.id,
      cliente_id: cliente.id,
      tipo_pendencia: "ARQUIVAMENTO",
      descricao: "XML do CT-e nao foi arquivado no Google Drive; reprocessar.",
    });
  }

  // Como na NF-e, o XML integral torna o resumo da mesma chave obsoleto.
  if (normalizado.completude === "completo" && normalizado.chave_acesso) {
    await supabase
      .from("documentos_fiscais")
      .update({ status_processamento: "Substituido" })
      .eq("cliente_id", cliente.id)
      .eq("chave_acesso", normalizado.chave_acesso)
      .eq("completude", "resumo");
  }

  return true;
}

async function registrarEstado(
  supabase: SupabaseClient,
  clienteId: string,
  ultimoNsu: string,
  status: string,
  mensagem: string,
  aplicarJanela: boolean
) {
  const patch: Record<string, unknown> = {
    ultimo_nsu_cte_recebida: Number(ultimoNsu) || 0,
    ultima_sincronizacao_cte: new Date().toISOString(),
    ultima_sincronizacao_cte_status: status,
    mensagem_ultima_sincronizacao_cte: mensagem.slice(0, 500),
  };

  if (aplicarJanela) {
    patch.proxima_sincronizacao_cte = new Date(Date.now() + JANELA_BLOQUEIO_MS).toISOString();
  }

  await supabase.from("clientes").update(patch).eq("id", clienteId);
}
