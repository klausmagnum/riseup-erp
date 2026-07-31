import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarLoteDFe, CSTAT, type SefazEnvironment } from "./distribuicaoDFe";
import { normalizarDocumento } from "./parseDocumento";
import { carregarCertificado, type RegistroCertificado } from "./certificado";
import { ensureDocumentoFolder, uploadTextFile } from "../googleDriveServer";

export interface ClienteSincronizavel {
  id: string;
  razao_social: string;
  identificacao: string | null;
  estado: string | null;
  ultimo_nsu_nfe_recebida: number | null;
}

export interface ResultadoSincronizacao {
  clienteId: string;
  cliente: string;
  status: "Sucesso" | "Erro" | "Sem novidades" | "Interrompido";
  encontrados: number;
  importados: number;
  erros: number;
  ultimoNsu: string;
  mensagem: string;
  /** Quando preenchido, o cliente não deve ser consultado antes deste horário. */
  bloqueadoAte?: Date;
}

/**
 * Quando a SEFAZ responde 137 (nenhum documento) ou 656 (consumo indevido),
 * novas consultas dentro da mesma hora são consideradas abuso e derrubam o
 * CNPJ por 1 hora. Respeitamos essa janela no agendamento.
 */
const JANELA_BLOQUEIO_MS = 61 * 60 * 1000;

/**
 * Nome do arquivo no Drive.
 *
 * A chave de acesso sozinha não serve: a mesma nota chega primeiro como resumo
 * e depois como XML completo, e os eventos (cancelamento, carta de correção)
 * repetem a chave da nota original. Como o Drive aceita nomes repetidos na
 * mesma pasta, isso produzia arquivos visualmente idênticos e indistinguíveis.
 *
 *   34...44.xml               nota completa, o arquivo que vale para escrituração
 *   34...44-resumo.xml        só o resumo, enquanto não houver manifestação
 *   34...44-evento-nsu123.xml cada evento, individualizado pelo NSU
 */
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

/**
 * Sincroniza um cliente, paginando pelo NSU até esgotar a distribuição ou o
 * orçamento de tempo.
 *
 * `deadline` existe porque função serverless tem limite de execução: ao chegar
 * perto dele paramos, gravamos o NSU alcançado e devolvemos "Interrompido" —
 * a próxima execução retoma exatamente daí, sem perder nem repetir documento.
 */
export async function sincronizarClienteNFe(params: {
  supabase: SupabaseClient;
  cliente: ClienteSincronizavel;
  certificado: RegistroCertificado;
  ambiente?: SefazEnvironment;
  deadline: number;
  maxLotes?: number;
}): Promise<ResultadoSincronizacao> {
  const { supabase, cliente, certificado } = params;
  const ambiente = params.ambiente ?? "producao";
  const maxLotes = params.maxLotes ?? 20;

  const base: ResultadoSincronizacao = {
    clienteId: cliente.id,
    cliente: cliente.razao_social,
    status: "Erro",
    encontrados: 0,
    importados: 0,
    erros: 0,
    ultimoNsu: String(cliente.ultimo_nsu_nfe_recebida ?? 0),
    mensagem: "",
  };

  const cnpj = (cliente.identificacao ?? "").replace(/\D/g, "");
  if (cnpj.length !== 14) {
    const mensagem = "Cliente sem CNPJ valido (a distribuicao de DF-e nao atende CPF).";

    // Marca a tentativa para tirar da frente da fila. Pessoa fisica nunca vai
    // passar daqui, e sem o carimbo voltaria ao topo em toda execucao.
    await registrarEstado(supabase, cliente.id, base.ultimoNsu, "Erro", mensagem, false);

    return { ...base, mensagem };
  }

  let credenciais;
  try {
    credenciais = await carregarCertificado(certificado);
  } catch (error) {
    const mensagem =
      error instanceof Error ? error.message : "Falha ao carregar certificado.";

    // Registrar mesmo em falha, e não apenas retornar: a fila é ordenada pela
    // última sincronização com nulos primeiro. Sem gravar o carimbo, um cliente
    // com certificado quebrado voltaria ao topo em toda execução e consumiria
    // orçamento indefinidamente, atrasando os demais.
    await registrarEstado(supabase, cliente.id, base.ultimoNsu, "Erro", mensagem, false);

    return { ...base, mensagem };
  }

  let ultNSU = String(cliente.ultimo_nsu_nfe_recebida ?? 0);
  let encontrados = 0;
  let importados = 0;
  let erros = 0;
  let lotes = 0;
  let interrompido = false;
  let ultimoMotivo = "";

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
      });

      lotes += 1;
      ultimoMotivo = `${lote.cStat} - ${lote.xMotivo}`;

      if (lote.cStat === CSTAT.CONSUMO_INDEVIDO) {
        await registrarEstado(supabase, cliente.id, ultNSU, "Erro", ultimoMotivo, true);
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
        // Nada novo. Avançar o NSU mesmo assim, pois a SEFAZ pode ter pulado
        // faixas (documentos de terceiros que não nos cabem).
        if (lote.ultNSU && lote.ultNSU !== ultNSU) ultNSU = lote.ultNSU;
        break;
      }

      if (lote.cStat !== CSTAT.LOTE_ENCONTRADO) {
        await registrarEstado(supabase, cliente.id, ultNSU, "Erro", ultimoMotivo, false);
        return {
          ...base,
          encontrados,
          importados,
          erros,
          ultimoNsu: ultNSU,
          mensagem: `SEFAZ retornou ${ultimoMotivo}`,
        };
      }

      encontrados += lote.documentos.length;

      for (const doc of lote.documentos) {
        // Cada documento custa uma escrita no banco e um upload ao Drive. Sem
        // conferir o prazo aqui, um lote de 50 rodava inteiro mesmo depois de
        // estourado o orçamento — e o NSU só avançava no fim do lote.
        if (Date.now() > params.deadline) {
          interrompido = true;
          break;
        }

        try {
          const gravado = await gravarDocumento(supabase, cliente, doc, cnpj);
          if (gravado) importados += 1;
          // Avança documento a documento: se a execução for cortada no meio do
          // lote, a próxima retoma exatamente daqui em vez de reprocessar tudo.
          ultNSU = doc.nsu || ultNSU;
        } catch (error) {
          erros += 1;
          console.error(
            `[sefaz] cliente=${cliente.id} nsu=${doc.nsu} falhou:`,
            error instanceof Error ? error.message : error
          );
        }
      }

      if (interrompido) break;

      ultNSU = lote.ultNSU || ultNSU;

      // Chegamos ao fim da fila da SEFAZ.
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

/** Grava o documento e arquiva o XML. Devolve false se já existia. */
async function gravarDocumento(
  supabase: SupabaseClient,
  cliente: ClienteSincronizavel,
  doc: { nsu: string; schema: string; xml: string },
  cnpjCliente: string
): Promise<boolean> {
  const normalizado = await normalizarDocumento(doc, {
    cnpjCliente,
    nomeCliente: cliente.razao_social,
  });

  // Schema que não interessa ao módulo — só avançamos o NSU.
  if (!normalizado) return false;

  const jaExiste = await supabase
    .from("documentos_fiscais")
    .select("id")
    .eq("cliente_id", cliente.id)
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
    // O arquivamento no Drive falhar não pode fazer perder o registro fiscal:
    // gravamos assim mesmo e marcamos pendência.
    console.error(
      `[drive] falha ao arquivar nsu=${doc.nsu} do cliente ${cliente.id}:`,
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
      origem: "SEFAZ/DistribuicaoDFe",
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
    // Corrida entre execuções simultâneas: o índice único resolveu, seguimos.
    if (error.code === "23505") return false;
    throw new Error(`Falha ao gravar documento NSU ${doc.nsu}: ${error.message}`);
  }

  if (!driveFileId && inserido) {
    await supabase.from("documentos_fiscais_pendencias").insert({
      documento_fiscal_id: inserido.id,
      cliente_id: cliente.id,
      tipo_pendencia: "ARQUIVAMENTO",
      descricao: "XML nao foi arquivado no Google Drive; reprocessar.",
    });
  }

  if (normalizado.completude === "resumo" && inserido) {
    await supabase.from("documentos_fiscais_pendencias").insert({
      documento_fiscal_id: inserido.id,
      cliente_id: cliente.id,
      tipo_pendencia: "AGUARDA_MANIFESTACAO",
      descricao:
        "Recebido apenas o resumo. O XML completo exige manifestacao do destinatario (Ciencia da Operacao).",
    });
  }

  // O resumo perde a razão de existir quando o XML integral da mesma nota
  // chega — são NSUs distintos, então ambos ficam gravados. Sem marcar o
  // antigo, a mesma nota aparece duas vezes para quem consulta.
  if (normalizado.completude === "completo" && normalizado.chave_acesso) {
    await supabase
      .from("documentos_fiscais")
      .update({ status_processamento: "Substituido" })
      .eq("cliente_id", cliente.id)
      .eq("chave_acesso", normalizado.chave_acesso)
      .eq("completude", "resumo");

    // A pendência de manifestação também deixa de fazer sentido.
    await supabase
      .from("documentos_fiscais_pendencias")
      .update({ status: "RESOLVIDA", resolvido_em: new Date().toISOString() })
      .eq("cliente_id", cliente.id)
      .eq("tipo_pendencia", "AGUARDA_MANIFESTACAO")
      .in(
        "documento_fiscal_id",
        (
          await supabase
            .from("documentos_fiscais")
            .select("id")
            .eq("cliente_id", cliente.id)
            .eq("chave_acesso", normalizado.chave_acesso)
            .eq("completude", "resumo")
        ).data?.map((d) => d.id) ?? []
      );
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
    ultimo_nsu_nfe_recebida: Number(ultimoNsu) || 0,
    ultima_sincronizacao_nfe: new Date().toISOString(),
    ultima_sincronizacao_nfe_status: status,
    mensagem_ultima_sincronizacao_nfe: mensagem.slice(0, 500),
  };

  if (aplicarJanela) {
    patch.proxima_sincronizacao_nfe = new Date(Date.now() + JANELA_BLOQUEIO_MS).toISOString();
  }

  await supabase.from("clientes").update(patch).eq("id", clienteId);
}
