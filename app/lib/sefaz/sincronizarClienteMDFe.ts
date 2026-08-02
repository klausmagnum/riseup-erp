import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarLoteDFe, CSTAT, type SefazEnvironment } from "./distribuicaoDFe";
import { normalizarDocumentoMDFe } from "./parseMDFe";
import { carregarCertificado, type RegistroCertificado } from "./certificado";
import { gravarDocumentoCapturado } from "./gravarDocumento";
import type { ClienteSincronizavel, ResultadoSincronizacao } from "./sincronizarCliente";

/**
 * Captura de MDF-e pela distribuição de DF-e da MDF-e.
 *
 * Mesmo protocolo da NF-e e do CT-e — distDFeInt paginado por NSU, docZip em
 * base64 e gzip — em outro serviço, hospedado na SVRS e com fila de NSU própria.
 * Por isso a origem gravada é outra: é ela que separa as filas na deduplicação.
 */

export const ORIGEM_MDFE = "SEFAZ/MDFeDistribuicaoDFe";

/** A SEFAZ derruba o CNPJ por uma hora quando ele consulta repetidamente sem
 *  ter documento novo. Mesma janela da NF-e e do CT-e. */
const JANELA_BLOQUEIO_MS = 61 * 60 * 1000;

export interface ClienteSincronizavelMDFe
  extends Omit<ClienteSincronizavel, "ultimo_nsu_nfe_recebida"> {
  ultimo_nsu_mdfe_recebida: number | null;
}

export async function sincronizarClienteMDFe(params: {
  supabase: SupabaseClient;
  cliente: ClienteSincronizavelMDFe;
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
    ultimoNsu: String(cliente.ultimo_nsu_mdfe_recebida ?? 0),
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

  let ultNSU = String(cliente.ultimo_nsu_mdfe_recebida ?? 0);
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
        servico: "mdfe",
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
            `[mdfe] cliente=${cliente.id} nsu=${doc.nsu} falhou:`,
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

async function gravarDocumento(
  supabase: SupabaseClient,
  cliente: ClienteSincronizavelMDFe,
  doc: { nsu: string; schema: string; xml: string },
  cnpjCliente: string
): Promise<boolean> {
  const normalizado = await normalizarDocumentoMDFe(doc, {
    cnpjCliente,
    nomeCliente: cliente.razao_social,
  });

  if (!normalizado) return false;

  return gravarDocumentoCapturado({
    supabase,
    cliente,
    documento: normalizado,
    xml: doc.xml,
    origem: ORIGEM_MDFE,
    nsu: doc.nsu,
    // A MDF-e não tem manifestação do destinatário — não tem destinatário. A
    // distribuição dela entrega o XML integral a quem é ator do manifesto.
    registrarPendenciaDeManifestacao: false,
  });
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
    ultimo_nsu_mdfe_recebida: Number(ultimoNsu) || 0,
    ultima_sincronizacao_mdfe: new Date().toISOString(),
    ultima_sincronizacao_mdfe_status: status,
    mensagem_ultima_sincronizacao_mdfe: mensagem.slice(0, 500),
  };

  if (aplicarJanela) {
    patch.proxima_sincronizacao_mdfe = new Date(Date.now() + JANELA_BLOQUEIO_MS).toISOString();
  }

  await supabase.from("clientes").update(patch).eq("id", clienteId);
}
