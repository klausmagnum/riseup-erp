import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarLoteDFe, CSTAT, type SefazEnvironment } from "./distribuicaoDFe";
import { normalizarDocumento } from "./parseDocumento";
import { carregarCertificado, type RegistroCertificado } from "./certificado";
import { gravarDocumentoCapturado, substituirResumo } from "./gravarDocumento";

/** Fila da distribuição da NF-e. Identifica o fluxo na deduplicação. */
export const ORIGEM_NFE = "SEFAZ/DistribuicaoDFe";

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
 * Tempo reservado para processar um lote inteiro antes de pedir o próximo.
 *
 * Pedir um lote que não caiba no tempo restante é pior do que parar: a SEFAZ
 * marca a faixa como entregue, e o que sobrar teria de ser pedido de novo na
 * execução seguinte — que é exatamente o que ela rejeita com 656 ("deve ser
 * utilizado o ultNSU nas solicitações subsequentes"). Era esse repedido que
 * derrubava o CNPJ por uma hora em metade das execuções.
 */
const RESERVA_POR_LOTE_MS = 60_000;

/**
 * Documentos gravados ao mesmo tempo dentro de um lote.
 *
 * Cada documento custa quatro a seis idas ao Supabase e ao Drive, uma de cada
 * vez: em série o lote de 50 passava de dois minutos. O limite existe para não
 * abrir 50 uploads simultâneos no Drive.
 */
const CONCORRENCIA_GRAVACAO = 6;

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
      // A folga é para o lote inteiro, não para a chamada: um lote pedido pela
      // metade vira repedido na próxima execução, e repedido vira 656.
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
      });

      lotes += 1;
      ultimoMotivo = `${lote.cStat} - ${lote.xMotivo}`;

      if (lote.cStat === CSTAT.CONSUMO_INDEVIDO) {
        // Não é falha: a SEFAZ responde isso quando o CNPJ pergunta de novo
        // sem ter nota nova, e pede uma hora de intervalo. Gravar como "Erro"
        // fazia o painel marcar de vermelho justamente o cliente que estava em
        // dia — ver ESTADO_BLOQUEADO em app/api/documentos-fiscais/painel.
        await registrarEstado(supabase, cliente.id, ultNSU, "Bloqueado", ultimoMotivo, true);
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

      // O lote é sempre processado inteiro. O NSU acompanha o que a SEFAZ
      // entregou, e não o último documento gravado, porque é o dela que a
      // próxima chamada tem de devolver.
      const gravacao = await gravarLote(supabase, cliente, lote.documentos, cnpj);
      importados += gravacao.importados;
      erros += gravacao.erros;

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

/**
 * Grava os documentos de um lote, alguns ao mesmo tempo.
 *
 * Em série cada documento levava cerca de dois segundos e meio — a consulta de
 * duplicidade, o upload do XML e a inserção, um round-trip de cada vez —, e o
 * lote de 50 estourava qualquer orçamento razoável. Em paralelo o mesmo lote
 * sai em torno de vinte segundos, que é o que torna possível processá-lo
 * inteiro antes de pedir o próximo.
 */
async function gravarLote(
  supabase: SupabaseClient,
  cliente: ClienteSincronizavel,
  documentos: Array<{ nsu: string; schema: string; xml: string }>,
  cnpjCliente: string
): Promise<{ importados: number; erros: number }> {
  let importados = 0;
  let erros = 0;

  const fila = [...documentos];
  // O XML integral de uma nota aposenta o resumo dela, e os dois podem cair no
  // mesmo lote. Em paralelo a ordem deixa de ser garantida, então a marcação é
  // refeita no fim do lote, quando ambos já estão gravados.
  const chavesCompletas = new Set<string>();

  async function trabalhador() {
    for (let doc = fila.shift(); doc; doc = fila.shift()) {
      try {
        const gravado = await gravarDocumento(supabase, cliente, doc, cnpjCliente);
        if (gravado.importado) importados += 1;
        if (gravado.chaveCompleta) chavesCompletas.add(gravado.chaveCompleta);
      } catch (error) {
        erros += 1;
        console.error(
          `[sefaz] cliente=${cliente.id} nsu=${doc.nsu} falhou:`,
          error instanceof Error ? error.message : error
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCORRENCIA_GRAVACAO, fila.length) }, trabalhador)
  );

  for (const chave of chavesCompletas) {
    await substituirResumo(supabase, cliente.id, chave);
  }

  return { importados, erros };
}

/** Grava o documento e arquiva o XML. `importado` é false se já existia. */
async function gravarDocumento(
  supabase: SupabaseClient,
  cliente: ClienteSincronizavel,
  doc: { nsu: string; schema: string; xml: string },
  cnpjCliente: string
): Promise<{ importado: boolean; chaveCompleta: string | null }> {
  const normalizado = await normalizarDocumento(doc, {
    cnpjCliente,
    nomeCliente: cliente.razao_social,
  });

  // Schema que não interessa ao módulo — só avançamos o NSU.
  if (!normalizado) return { importado: false, chaveCompleta: null };

  const importado = await gravarDocumentoCapturado({
    supabase,
    cliente,
    documento: normalizado,
    xml: doc.xml,
    origem: ORIGEM_NFE,
    nsu: doc.nsu,
  });

  const chaveCompleta =
    normalizado.completude === "completo" ? normalizado.chave_acesso : null;

  return { importado, chaveCompleta: chaveCompleta || null };
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
