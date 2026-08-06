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

/**
 * Tempo reservado para processar um lote inteiro antes de pedir o próximo, e
 * documentos gravados ao mesmo tempo dentro dele. Mesmo raciocínio da NF-e, em
 * sincronizarCliente.ts: abandonar um lote pela metade faz a execução seguinte
 * repedir uma faixa que a SEFAZ já entregou, e é isso que ela rejeita com 656.
 */
const RESERVA_POR_LOTE_MS = 60_000;
const CONCORRENCIA_GRAVACAO = 6;

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
  // A hora de intervalo conta a partir de não haver mais o que buscar, e não de
  // uma consulta que voltou vazia: quem drena a fila trazendo documentos também
  // chegou ao fim dela.
  let fimDaFila = false;

  try {
    while (lotes < maxLotes) {
      // A folga é para o lote inteiro, não para a chamada.
      if (Date.now() + RESERVA_POR_LOTE_MS > params.deadline) {
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
        fimDaFila = true;
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

      // O lote é sempre processado inteiro, e o NSU acompanha o que a SEFAZ
      // entregou — é o dela que a próxima chamada tem de devolver.
      const gravacao = await gravarLote(supabase, cliente, lote.documentos, cnpj);
      importados += gravacao.importados;
      erros += gravacao.erros;

      ultNSU = lote.ultNSU || ultNSU;

      // Fim da fila.
      if (Number(lote.ultNSU) >= Number(lote.maxNSU)) {
        fimDaFila = true;
        break;
      }
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

  await registrarEstado(supabase, cliente.id, ultNSU, status, mensagem, fimDaFila);

  return { ...base, status, encontrados, importados, erros, ultimoNsu: ultNSU, mensagem };
}

/**
 * Grava os documentos de um lote, alguns ao mesmo tempo — é o que faz o lote
 * inteiro caber no orçamento. Ver gravarLote em sincronizarCliente.ts.
 *
 * Aqui não há o varredor de resumo que a NF-e e o CT-e têm: a SVRS não publica
 * resMDFe, e quem é ator do manifesto recebe o procMDFe integral. Sem resumo,
 * não há o que a chegada do XML completo possa aposentar.
 */
async function gravarLote(
  supabase: SupabaseClient,
  cliente: ClienteSincronizavelMDFe,
  documentos: Array<{ nsu: string; schema: string; xml: string }>,
  cnpjCliente: string
): Promise<{ importados: number; erros: number }> {
  let importados = 0;
  let erros = 0;

  const fila = [...documentos];

  async function trabalhador() {
    for (let doc = fila.shift(); doc; doc = fila.shift()) {
      try {
        if (await gravarDocumento(supabase, cliente, doc, cnpjCliente)) importados += 1;
      } catch (error) {
        erros += 1;
        console.error(
          `[mdfe] cliente=${cliente.id} nsu=${doc.nsu} falhou:`,
          error instanceof Error ? error.message : error
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCORRENCIA_GRAVACAO, fila.length) }, trabalhador)
  );

  return { importados, erros };
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
