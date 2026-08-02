import { parseStringPromise } from "xml2js";
import type { DocumentoDistribuido } from "./distribuicaoDFe";
import { destrincharChave, type DocumentoNormalizado } from "./parseDocumento";

/**
 * Converte uma MDF-e da distribuição no registro de public.documentos_fiscais.
 *
 * A MDF-e não é documento de valor: é o manifesto que amarra uma viagem aos
 * documentos que vão dentro do veículo. Não tem destinatário, não tem imposto e
 * o único valor em dinheiro é o da carga transportada — que é a soma das notas
 * que ela manifesta, e essas já entram no sistema pela distribuição da NF-e. Por
 * isso valor_total fica nulo: somar a coluna contaria a mesma mercadoria duas
 * vezes. O valor da carga vai em json_dados, onde informa sem contaminar conta.
 *
 * O que importa para o escritório é o par MDF-e emitida / MDF-e encerrada. Uma
 * viagem que terminou sem o evento de encerramento fica pendente na SEFAZ e
 * impede a emissão da próxima, então o evento 110112 é gravado como qualquer
 * outro e aparece no quadro de eventos.
 */

/** Modal declarado em ide/modal. */
const MODAIS: Record<string, string> = {
  "1": "Rodoviario",
  "2": "Aereo",
  "3": "Aquaviario",
  "4": "Ferroviario",
};

/** Quem emitiu, em ide/tpEmit. Separa o transportador do dono da carga. */
const EMITENTES: Record<string, string> = {
  "1": "Prestador de servico de transporte",
  "2": "Transportador de carga propria",
  "3": "Prestador de servico com CT-e globalizado",
};

/**
 * Eventos da MDF-e. O encerramento é o que o escritório precisa enxergar: sem
 * ele a viagem continua aberta na SEFAZ.
 */
const EVENTOS: Record<string, string> = {
  "110111": "Cancelamento",
  "110112": "Encerramento",
  "110114": "Inclusao de condutor",
  "110115": "Inclusao de DF-e",
  "110116": "Pagamento da operacao de transporte",
  "110117": "Confirmacao do servico de transporte",
  "110118": "Alteracao do pagamento do servico",
  "310112": "Encerramento pelo fisco",
  "310620": "Registro de passagem",
};

function texto(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "string") return valor;
  if (typeof valor === "number") return String(valor);
  if (typeof valor === "object" && "_" in (valor as Record<string, unknown>)) {
    return String((valor as Record<string, unknown>)._ ?? "");
  }
  return "";
}

function numero(valor: unknown): number | null {
  const bruto = texto(valor);
  if (!bruto) return null;
  const n = Number.parseFloat(bruto);
  return Number.isFinite(n) ? n : null;
}

function data(valor: unknown): string | null {
  const bruto = texto(valor);
  if (!bruto) return null;
  const iso = bruto.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

/** Grupos que se repetem chegam como objeto quando vêm sozinhos. */
function lista(valor: unknown): Record<string, unknown>[] {
  if (!valor) return [];
  const itens = Array.isArray(valor) ? valor : [valor];
  return itens.filter((i): i is Record<string, unknown> => typeof i === "object" && i !== null);
}

function documentoDe(no: Record<string, unknown> | undefined): string {
  if (!no) return "";
  return texto(no.CNPJ) || texto(no.CPF);
}

function somenteDigitos(valor: string) {
  return valor.replace(/\D/g, "");
}

async function lerXml(xml: string) {
  return parseStringPromise(xml, {
    explicitArray: false,
    tagNameProcessors: [(name: string) => name.replace(/^.*:/, "")],
    ignoreAttrs: false,
  });
}

/** O grupo do modal muda de nome conforme o meio de transporte. */
function grupoDoModal(inf: Record<string, unknown>) {
  const infModal = (inf.infModal ?? {}) as Record<string, unknown>;

  for (const nome of ["rodo", "aereo", "aquav", "ferrov"]) {
    const grupo = infModal[nome];
    if (grupo && typeof grupo === "object") {
      return { nome, grupo: grupo as Record<string, unknown> };
    }
  }

  return { nome: "", grupo: {} as Record<string, unknown> };
}

/**
 * Quem contratou o transporte.
 *
 * No modal rodoviário os contratantes vêm dentro do grupo da ANTT, e é por eles
 * que uma MDF-e chega a quem não a emitiu: o cliente que contrata frete é ator
 * do manifesto sem ser o transportador.
 */
function contratantesDe(inf: Record<string, unknown>) {
  const { grupo } = grupoDoModal(inf);
  const infANTT = (grupo.infANTT ?? {}) as Record<string, unknown>;

  return lista(infANTT.infContratante)
    .map((c) => documentoDe(c))
    .filter(Boolean);
}

/** Percurso declarado: das UFs de início e fim, com as intermediárias no meio. */
function percursoDe(ide: Record<string, unknown>) {
  const meio = lista(ide.infPercurso)
    .map((p) => texto(p.UFPer))
    .filter(Boolean);

  return [texto(ide.UFIni), ...meio, texto(ide.UFFim)].filter(Boolean).join(" > ");
}

/** Descrição do evento: o detalhe traz o nome, e o tipo é o que sempre existe. */
function descricaoDoEvento(
  infEvento: Record<string, unknown>,
  retorno: Record<string, unknown> | undefined
) {
  const detalhe = (infEvento.detEvento ?? {}) as Record<string, unknown>;

  for (const valor of Object.values(detalhe)) {
    if (valor && typeof valor === "object") {
      const descricao = texto((valor as Record<string, unknown>).descEvento);
      if (descricao) return descricao;
    }
  }

  const tipo = texto(infEvento.tpEvento);
  return texto(retorno?.xEvento) || EVENTOS[tipo] || `Evento ${tipo}`;
}

export async function normalizarDocumentoMDFe(
  doc: DocumentoDistribuido,
  contexto: { cnpjCliente: string; nomeCliente?: string }
): Promise<DocumentoNormalizado | null> {
  const parsed = await lerXml(doc.xml);
  const cnpjCliente = somenteDigitos(contexto.cnpjCliente);

  // ---- MDF-e completa (mdfeProc) ----
  // A distribuição da MDF-e não tem resumo: o pacote de schemas da SVRS só
  // publica procMDFe e procEventoMDFe. Quem é ator do manifesto recebe o XML
  // integral, e não existe manifestação do destinatário para pedir o resto.
  const mdfeProc = parsed?.mdfeProc ?? (parsed?.MDFe ? { MDFe: parsed.MDFe } : null);

  if (mdfeProc?.MDFe) {
    const inf = mdfeProc.MDFe.infMDFe ?? {};
    const ide = inf.ide ?? {};
    const emit = inf.emit ?? {};
    const tot = inf.tot ?? {};

    const chave = texto(inf.$?.Id).replace(/^MDFe/, "");
    const daChave = destrincharChave(chave);

    const contratantes = contratantesDe(inf);
    const clienteEhContratante = contratantes.some((c) => somenteDigitos(c) === cnpjCliente);

    const { nome: modal, grupo } = grupoDoModal(inf);
    const veiculo = (grupo.veicTracao ?? {}) as Record<string, unknown>;

    const descargas = lista(inf.infDoc?.infMunDescarga);

    return {
      tipo_documento: "MDFe",
      numero: texto(ide.nMDF) || daChave.numero,
      serie: texto(ide.serie) || daChave.serie,
      chave_acesso: chave,
      data_emissao: data(ide.dhEmi),
      // Nulo de propósito: ver o comentário do topo do arquivo.
      valor_total: null,
      // Emitente é o transportador. Quando é o próprio cliente, o painel
      // classifica como saída; quando é a transportadora que ele contratou,
      // como entrada.
      emitente_cnpj_cpf: documentoDe(emit),
      emitente_nome: texto(emit.xNome),
      // O manifesto não tem destinatário. Quem ocupa o outro lado é quem
      // contratou o transporte, e é isso que a coluna guarda.
      destinatario_cnpj_cpf: clienteEhContratante ? cnpjCliente : (contratantes[0] ?? ""),
      destinatario_nome: clienteEhContratante ? (contexto.nomeCliente ?? "") : "",
      municipio: texto(emit.enderEmit?.xMun),
      uf: texto(emit.enderEmit?.UF) || daChave.uf,
      status_documento: texto(mdfeProc.protMDFe?.infProt?.xMotivo) || "Autorizado",
      completude: "completo",
      json_dados: {
        schema: doc.schema,
        nsu: doc.nsu,
        modal: MODAIS[texto(ide.modal)] || texto(ide.modal),
        modalGrupo: modal,
        tipoEmitente: EMITENTES[texto(ide.tpEmit)] || texto(ide.tpEmit),
        percurso: percursoDe(ide),
        municipiosCarregamento: lista(ide.infMunCarrega)
          .map((m) => texto(m.xMunCarrega))
          .filter(Boolean),
        municipiosDescarga: descargas.map((m) => texto(m.xMunDescarga)).filter(Boolean),
        // As chaves das notas transportadas ficam no XML arquivado no Drive; aqui
        // basta a contagem, que é o que a conferência olha.
        quantidadeNFe: numero(tot.qNFe) ?? contarChaves(descargas, "infNFe"),
        quantidadeCTe: numero(tot.qCTe) ?? contarChaves(descargas, "infCTe"),
        valorCarga: numero(tot.vCarga),
        pesoCarga: numero(tot.qCarga),
        placaVeiculo: texto(veiculo.placa),
        condutores: lista(veiculo.condutor)
          .map((c) => texto(c.xNome))
          .filter(Boolean),
        rntrc: texto((grupo.infANTT as Record<string, unknown>)?.RNTRC),
        contratantes,
        // Separa a MDF-e que o cliente emitiu daquela em que ele só contratou o
        // frete — a segunda não é obrigação de encerramento dele.
        clienteEhContratante,
        dataInicioViagem: data(ide.dhIniViagem),
      },
    };
  }

  // ---- Eventos (encerramento, cancelamento, inclusão de condutor ou de DF-e) ----
  const procEvento = parsed?.procEventoMDFe;
  const evento = procEvento?.eventoMDFe?.infEvento ?? parsed?.eventoMDFe?.infEvento;

  if (evento) {
    const chave = texto(evento.chMDFe);
    const daChave = destrincharChave(chave);
    const retorno = procEvento?.retEventoMDFe?.infEvento;

    const detalhe = (evento.detEvento ?? {}) as Record<string, unknown>;
    const encerramento = detalhe.evEncMDFe as Record<string, unknown> | undefined;

    return {
      tipo_documento: "EventoMDFe",
      numero: daChave.numero,
      serie: daChave.serie,
      chave_acesso: chave,
      data_emissao: data(evento.dhEvento ?? retorno?.dhRegEvento),
      valor_total: null,
      emitente_cnpj_cpf: documentoDe(evento),
      emitente_nome: "",
      destinatario_cnpj_cpf: cnpjCliente,
      destinatario_nome: contexto.nomeCliente ?? "",
      municipio: "",
      uf: daChave.uf,
      status_documento: descricaoDoEvento(evento, retorno),
      completude: "evento",
      json_dados: {
        schema: doc.schema,
        nsu: doc.nsu,
        tpEvento: texto(evento.tpEvento),
        // O tipo sozinho não identifica o evento: um manifesto pode receber
        // várias inclusões de DF-e, e é a sequência que as separa.
        nSeqEvento: texto(evento.nSeqEvento),
        // A data do encerramento é a que fecha a viagem, e não a do registro.
        dataEncerramento: encerramento ? data(encerramento.dtEnc) : null,
        ufEncerramento: encerramento ? texto(encerramento.cUF) : "",
      },
    };
  }

  return null;
}

/** Conta as chaves transportadas quando o grupo de totais não veio. */
function contarChaves(descargas: Record<string, unknown>[], grupo: string) {
  return descargas.reduce((soma, descarga) => soma + lista(descarga[grupo]).length, 0);
}
