import { parseStringPromise } from "xml2js";
import type { DocumentoDistribuido } from "./distribuicaoDFe";

/**
 * Dados normalizados de um documento fiscal, no formato da tabela
 * public.documentos_fiscais.
 */
export interface DocumentoNormalizado {
  tipo_documento: string;
  numero: string;
  serie: string;
  chave_acesso: string;
  data_emissao: string | null;
  valor_total: number | null;
  emitente_cnpj_cpf: string;
  emitente_nome: string;
  destinatario_cnpj_cpf: string;
  destinatario_nome: string;
  municipio: string;
  uf: string;
  status_documento: string;
  /** "resumo" = só o resumo da nota; "completo" = XML integral da NF-e. */
  completude: "resumo" | "completo" | "evento";
  json_dados: Record<string, unknown>;
}

const UF_POR_CODIGO: Record<string, string> = {
  "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP",
  "17": "TO", "21": "MA", "22": "PI", "23": "CE", "24": "RN", "25": "PB",
  "26": "PE", "27": "AL", "28": "SE", "29": "BA", "31": "MG", "32": "ES",
  "33": "RJ", "35": "SP", "41": "PR", "42": "SC", "43": "RS", "50": "MS",
  "51": "MT", "52": "GO", "53": "DF",
};

/**
 * A chave de acesso de 44 dígitos carrega UF, série e número. Isso importa
 * porque o resumo (resNFe) não traz número nem série em campo próprio.
 *
 * Layout: cUF(2) AAMM(4) CNPJ(14) mod(2) serie(3) nNF(9) tpEmis(1) cNF(8) cDV(1)
 */
export function destrincharChave(chave: string) {
  const limpa = (chave || "").replace(/\D/g, "");
  if (limpa.length !== 44) {
    return { uf: "", serie: "", numero: "", modelo: "" };
  }

  return {
    uf: UF_POR_CODIGO[limpa.slice(0, 2)] ?? "",
    modelo: limpa.slice(20, 22),
    serie: String(Number(limpa.slice(22, 25))),
    numero: String(Number(limpa.slice(25, 34))),
  };
}

function texto(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "string") return valor;
  if (typeof valor === "number") return String(valor);
  // xml2js pode devolver { _: "valor", $: {...} }
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

/** dhEmi vem como ISO com timezone; dEmi (layouts antigos) como AAAA-MM-DD. */
function data(valor: unknown): string | null {
  const bruto = texto(valor);
  if (!bruto) return null;
  const iso = bruto.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

async function lerXml(xml: string) {
  return parseStringPromise(xml, {
    explicitArray: false,
    tagNameProcessors: [(name: string) => name.replace(/^.*:/, "")],
    ignoreAttrs: false,
  });
}

/**
 * Converte um documento da distribuição em registro normalizado.
 *
 * Retorna null para schemas que não interessam ao módulo (eventos de
 * terceiros, por exemplo), para que o chamador apenas avance o NSU.
 */
export async function normalizarDocumento(
  doc: DocumentoDistribuido,
  contexto: { cnpjCliente: string; nomeCliente?: string }
): Promise<DocumentoNormalizado | null> {
  const parsed = await lerXml(doc.xml);

  // ---- NF-e completa (procNFe) ----
  const nfeProc = parsed?.nfeProc;
  if (nfeProc) {
    const infNFe = nfeProc.NFe?.infNFe ?? {};
    const ide = infNFe.ide ?? {};
    const emit = infNFe.emit ?? {};
    const dest = infNFe.dest ?? {};
    const icmsTot = infNFe.total?.ICMSTot ?? {};
    const chave = texto(infNFe.$?.Id).replace(/^NFe/, "");
    const daChave = destrincharChave(chave);

    return {
      tipo_documento: "NFe",
      numero: texto(ide.nNF) || daChave.numero,
      serie: texto(ide.serie) || daChave.serie,
      chave_acesso: chave,
      data_emissao: data(ide.dhEmi ?? ide.dEmi),
      valor_total: numero(icmsTot.vNF),
      emitente_cnpj_cpf: texto(emit.CNPJ) || texto(emit.CPF),
      emitente_nome: texto(emit.xNome),
      destinatario_cnpj_cpf: texto(dest.CNPJ) || texto(dest.CPF),
      destinatario_nome: texto(dest.xNome),
      municipio: texto(emit.enderEmit?.xMun),
      uf: texto(emit.enderEmit?.UF) || daChave.uf,
      status_documento: texto(nfeProc.protNFe?.infProt?.xMotivo) || "Autorizada",
      completude: "completo",
      json_dados: { schema: doc.schema, nsu: doc.nsu },
    };
  }

  // ---- Resumo de NF-e (resNFe) ----
  // É o que a SEFAZ entrega enquanto não houver manifestação do destinatário.
  const resNFe = parsed?.resNFe;
  if (resNFe) {
    const chave = texto(resNFe.chNFe);
    const daChave = destrincharChave(chave);

    return {
      tipo_documento: "NFe",
      numero: daChave.numero,
      serie: daChave.serie,
      chave_acesso: chave,
      data_emissao: data(resNFe.dhEmi),
      valor_total: numero(resNFe.vNF),
      emitente_cnpj_cpf: texto(resNFe.CNPJ) || texto(resNFe.CPF),
      emitente_nome: texto(resNFe.xNome),
      // No resumo o destinatário é sempre o próprio cliente consultante.
      destinatario_cnpj_cpf: contexto.cnpjCliente,
      destinatario_nome: contexto.nomeCliente ?? "",
      municipio: "",
      uf: daChave.uf,
      status_documento: texto(resNFe.cSitNFe) === "3" ? "Cancelada" : "Autorizada",
      completude: "resumo",
      json_dados: {
        schema: doc.schema,
        nsu: doc.nsu,
        cSitNFe: texto(resNFe.cSitNFe),
        // Guardado porque a manifestação do destinatário exige o digest.
        digVal: texto(resNFe.digVal),
      },
    };
  }

  // ---- Eventos (cancelamento, CC-e, manifestação) ----
  const evento = parsed?.procEventoNFe?.evento?.infEvento ?? parsed?.resEvento;
  if (evento) {
    const chave = texto(evento.chNFe);
    const daChave = destrincharChave(chave);

    return {
      tipo_documento: "EventoNFe",
      numero: daChave.numero,
      serie: daChave.serie,
      chave_acesso: chave,
      data_emissao: data(evento.dhEvento ?? evento.dhRecbto),
      valor_total: null,
      emitente_cnpj_cpf: texto(evento.CNPJ) || texto(evento.CPF),
      emitente_nome: texto(evento.xNome),
      destinatario_cnpj_cpf: contexto.cnpjCliente,
      destinatario_nome: contexto.nomeCliente ?? "",
      municipio: "",
      uf: daChave.uf,
      status_documento: texto(evento.xEvento) || texto(evento.tpEvento),
      completude: "evento",
      json_dados: {
        schema: doc.schema,
        nsu: doc.nsu,
        tpEvento: texto(evento.tpEvento),
      },
    };
  }

  return null;
}
