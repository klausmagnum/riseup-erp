import { parseStringPromise } from "xml2js";
import type { DocumentoDistribuido } from "./distribuicaoDFe";
import { destrincharChave, type DocumentoNormalizado } from "./parseDocumento";

/**
 * Converte um CT-e da distribuição no registro de public.documentos_fiscais.
 *
 * O CT-e tem mais atores que a NF-e: quem emite é sempre a transportadora, e
 * o serviço envolve remetente, destinatário, expedidor e recebedor. Quem paga
 * o frete — o tomador — é apontado por `toma3`/`toma4`, e é essa a informação
 * que decide se o documento gera crédito para o cliente. Ela não cabe nas
 * colunas de emitente e destinatário, então vai em json_dados.
 */

/** Quem o campo toma3 aponta como tomador do serviço. */
const TOMADORES = ["Remetente", "Expedidor", "Recebedor", "Destinatario"] as const;

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

function documentoDe(no: Record<string, unknown> | undefined): string {
  if (!no) return "";
  return texto(no.CNPJ) || texto(no.CPF);
}

/**
 * A SEFAZ do CT-e devolve o xMotivo com um placeholder do template dela por
 * substituir: "Autorizado o uso do $APP_NAME_FORMATED$". Guardar isso levaria
 * o defeito deles direto para a tela do escritório.
 */
function limparMotivo(motivo: string, tipo: string) {
  return motivo.replace(/\$APP_NAME_FORMATED\$/g, tipo).trim();
}

async function lerXml(xml: string) {
  return parseStringPromise(xml, {
    explicitArray: false,
    tagNameProcessors: [(name: string) => name.replace(/^.*:/, "")],
    ignoreAttrs: false,
  });
}

/**
 * Identifica o tomador do frete.
 *
 * `toma3` aponta um dos atores já declarados no documento; `toma4` traz um
 * terceiro, com CNPJ próprio. Saber isso é o que separa um CT-e que o cliente
 * pagou de um que ele apenas figura como destinatário.
 */
function identificarTomador(inf: Record<string, unknown>) {
  const ide = (inf.ide ?? {}) as Record<string, unknown>;

  const toma4 = ide.toma4 as Record<string, unknown> | undefined;
  if (toma4) {
    return {
      papel: "Outro",
      cnpj: documentoDe(toma4),
      nome: texto(toma4.xNome),
    };
  }

  const toma3 = ide.toma3 as Record<string, unknown> | undefined;
  const codigo = Number(texto(toma3?.toma));
  const papel = TOMADORES[codigo] ?? "";

  const porPapel: Record<string, string> = {
    Remetente: "rem",
    Expedidor: "exped",
    Recebedor: "receb",
    Destinatario: "dest",
  };

  const ator = (inf[porPapel[papel] ?? ""] ?? {}) as Record<string, unknown>;

  return { papel, cnpj: documentoDe(ator), nome: texto(ator.xNome) };
}

export async function normalizarDocumentoCTe(
  doc: DocumentoDistribuido,
  contexto: { cnpjCliente: string; nomeCliente?: string }
): Promise<DocumentoNormalizado | null> {
  const parsed = await lerXml(doc.xml);

  // ---- CT-e completo (cteProc) ----
  const cteProc = parsed?.cteProc ?? (parsed?.CTe ? { CTe: parsed.CTe } : null);
  if (cteProc?.CTe) {
    const inf = cteProc.CTe.infCte ?? {};
    const ide = inf.ide ?? {};
    const emit = inf.emit ?? {};
    const dest = inf.dest ?? {};
    const rem = inf.rem ?? {};

    const chave = texto(inf.$?.Id).replace(/^CTe/, "");
    const daChave = destrincharChave(chave);
    const tomador = identificarTomador(inf);
    // O modelo 67 é o CT-e OS, documento distinto que chega pelo mesmo
    // serviço; separar aqui evita misturar os dois no mesmo quadro.
    const tipo = daChave.modelo === "67" ? "CTeOS" : "CTe";

    return {
      tipo_documento: tipo,
      numero: texto(ide.nCT) || daChave.numero,
      serie: texto(ide.serie) || daChave.serie,
      chave_acesso: chave,
      data_emissao: data(ide.dhEmi),
      valor_total: numero(inf.vPrest?.vTPrest),
      // Emitente é a transportadora. A regra de direção do painel classifica
      // como entrada quando não é o próprio cliente, que é o caso normal.
      emitente_cnpj_cpf: documentoDe(emit),
      emitente_nome: texto(emit.xNome),
      destinatario_cnpj_cpf: documentoDe(dest) || contexto.cnpjCliente,
      destinatario_nome: texto(dest.xNome) || (contexto.nomeCliente ?? ""),
      municipio: texto(emit.enderEmit?.xMun),
      uf: texto(emit.enderEmit?.UF) || daChave.uf,
      status_documento:
        limparMotivo(texto(cteProc.protCTe?.infProt?.xMotivo), tipo) || "Autorizado",
      completude: "completo",
      json_dados: {
        schema: doc.schema,
        nsu: doc.nsu,
        cfop: texto(ide.CFOP),
        naturezaOperacao: texto(ide.natOp),
        modal: texto(ide.modal),
        tomadorPapel: tomador.papel,
        tomadorCnpj: tomador.cnpj,
        tomadorNome: tomador.nome,
        // Um CT-e pago pelo cliente gera crédito; um em que ele só figura
        // como destinatário, não.
        clienteEhTomador:
          tomador.cnpj.replace(/\D/g, "") === contexto.cnpjCliente.replace(/\D/g, ""),
        remetenteNome: texto(rem.xNome),
        origem: `${texto(ide.xMunIni)}/${texto(ide.UFIni)}`,
        destino: `${texto(ide.xMunFim)}/${texto(ide.UFFim)}`,
        valorCarga: numero(inf.infCTeNorm?.infCarga?.vCarga),
      },
    };
  }

  // ---- Resumo de CT-e (resCTe) ----
  // Chega quando o cliente é parte interessada mas não tem direito ao XML
  // integral sem manifestação.
  const resCTe = parsed?.resCTe;
  if (resCTe) {
    const chave = texto(resCTe.chCTe);
    const daChave = destrincharChave(chave);

    return {
      tipo_documento: daChave.modelo === "67" ? "CTeOS" : "CTe",
      numero: daChave.numero,
      serie: daChave.serie,
      chave_acesso: chave,
      data_emissao: data(resCTe.dhEmi),
      valor_total: numero(resCTe.vTPrest),
      emitente_cnpj_cpf: texto(resCTe.CNPJ) || texto(resCTe.CPF),
      emitente_nome: texto(resCTe.xNome),
      destinatario_cnpj_cpf: contexto.cnpjCliente,
      destinatario_nome: contexto.nomeCliente ?? "",
      municipio: "",
      uf: daChave.uf,
      status_documento: texto(resCTe.cSitCTe) === "3" ? "Cancelado" : "Autorizada",
      completude: "resumo",
      json_dados: {
        schema: doc.schema,
        nsu: doc.nsu,
        cSitCTe: texto(resCTe.cSitCTe),
        tomadorPapel: texto(resCTe.tpCTe),
      },
    };
  }

  // ---- Eventos (cancelamento, CC-e, prestação em desacordo) ----
  const evento = parsed?.procEventoCTe?.eventoCTe?.infEvento ?? parsed?.resEventoCTe;
  if (evento) {
    const chave = texto(evento.chCTe);
    const daChave = destrincharChave(chave);

    return {
      tipo_documento: "EventoCTe",
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
        // O tipo sozinho não identifica o evento: a sequência é que separa um
        // segundo evento do mesmo tipo sobre o mesmo CT-e.
        nSeqEvento: texto(evento.nSeqEvento),
      },
    };
  }

  return null;
}
