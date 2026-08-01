import { parseStringPromise } from "xml2js";
import type { DocumentoNormalizado } from "../sefaz/parseDocumento";
import type { DocumentoADN } from "./distribuicaoADN";

/**
 * Converte o XML da NFS-e do padrão nacional no registro de
 * public.documentos_fiscais.
 *
 * A estrutura tem duas camadas que importam: `infNFSe` é o que o município
 * gerou (número, local, valores líquidos) e o `DPS` aninhado é a declaração
 * que o prestador enviou (série, competência, prestador, tomador, descrição do
 * serviço). Os dados que o escritório precisa estão repartidos entre as duas.
 */

/** Chave da NFS-e: 50 dígitos, contra os 44 da família SEFAZ. */
export const TAMANHO_CHAVE_NFSE = 50;

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

/** CNPJ quando houver, senão CPF — prestador e tomador podem ser pessoa física. */
function documentoDe(no: Record<string, unknown> | undefined): string {
  if (!no) return "";
  return texto(no.CNPJ) || texto(no.CPF) || texto(no.NIF);
}

async function lerXml(xml: string) {
  return parseStringPromise(xml, {
    explicitArray: false,
    tagNameProcessors: [(name: string) => name.replace(/^.*:/, "")],
    ignoreAttrs: false,
  });
}

/**
 * cStat de NFS-e autorizada. 100 e 107 apareceram no ambiente real; qualquer
 * outro valor é preservado como veio, para não inventar rótulo.
 */
function situacaoPorCstat(cStat: string): string {
  if (cStat === "100" || cStat === "107") return "Autorizada";
  return cStat ? `cStat ${cStat}` : "Autorizada";
}

export async function normalizarDocumentoNFSe(
  doc: DocumentoADN,
  contexto: { cnpjCliente: string; nomeCliente?: string }
): Promise<DocumentoNormalizado | null> {
  const parsed = await lerXml(doc.xml);

  // ---- NFS-e ----
  const nfse = parsed?.NFSe;
  if (nfse) {
    const inf = nfse.infNFSe ?? {};
    const emit = inf.emit ?? {};
    const infDPS = inf.DPS?.infDPS ?? {};
    const prest = infDPS.prest ?? {};
    const toma = infDPS.toma ?? {};
    const serv = infDPS.serv ?? {};

    // O Id vem como "NFS" + os 50 dígitos da chave.
    const chave =
      doc.chaveAcesso || texto(inf.$?.Id).replace(/^NFS/, "");

    // vLiq é o líquido que o município apurou; o vServ do DPS é o valor do
    // serviço declarado. Para escrituração vale o do serviço, com o líquido
    // como reserva quando o DPS não trouxer.
    const valorServico = numero(infDPS.valores?.vServPrest?.vServ);
    const valorLiquido = numero(inf.valores?.vLiq);

    // O prestador do DPS é a fonte da direção: quando ele é o cliente, a nota
    // é prestada (saída); quando não, é tomada (entrada).
    const cnpjPrestador = documentoDe(prest) || documentoDe(emit);

    return {
      tipo_documento: "NFSe",
      numero: texto(inf.nNFSe) || texto(infDPS.nDPS),
      serie: texto(infDPS.serie),
      chave_acesso: chave,
      data_emissao: data(infDPS.dhEmi ?? inf.dhProc),
      valor_total: valorServico ?? valorLiquido,
      emitente_cnpj_cpf: cnpjPrestador,
      emitente_nome: texto(emit.xNome) || texto(emit.xFant),
      destinatario_cnpj_cpf: documentoDe(toma) || contexto.cnpjCliente,
      destinatario_nome: texto(toma.xNome) || (contexto.nomeCliente ?? ""),
      municipio: texto(inf.xLocPrestacao) || texto(inf.xLocEmi),
      uf: texto(emit.enderNac?.UF),
      status_documento: situacaoPorCstat(texto(inf.cStat)),
      // A NFS-e nacional chega inteira: não existe o estágio de resumo que a
      // NF-e tem enquanto falta manifestação do destinatário.
      completude: "completo",
      json_dados: {
        origem: "ADN",
        nsu: doc.nsu,
        cStat: texto(inf.cStat),
        competencia: texto(infDPS.dCompet),
        codigoServico: texto(serv.cServ?.cTribNac),
        descricaoServico: texto(serv.cServ?.xDescServ).slice(0, 500),
        localEmissao: texto(inf.xLocEmi),
        inscricaoMunicipal: texto(emit.IM),
        valorLiquido,
      },
    };
  }

  // ---- Eventos (cancelamento, substituição) ----
  const evento = parsed?.evento?.infEvento;
  if (evento) {
    const pedido = evento.pedRegEvento?.infPedReg ?? {};

    // O tipo do evento é o nome do elemento eXXXXXX dentro do pedido.
    const chaveEvento = Object.keys(pedido).find((k) => /^e\d{6}$/.test(k));
    const detalhe = chaveEvento
      ? (pedido[chaveEvento] as Record<string, unknown>)
      : undefined;

    return {
      tipo_documento: "EventoNFSe",
      numero: "",
      serie: "",
      chave_acesso: texto(pedido.chNFSe) || doc.chaveAcesso,
      data_emissao: data(pedido.dhEvento ?? evento.dhProc),
      valor_total: null,
      emitente_cnpj_cpf: texto(pedido.CNPJAutor) || texto(pedido.CPFAutor),
      emitente_nome: "",
      destinatario_cnpj_cpf: contexto.cnpjCliente,
      destinatario_nome: contexto.nomeCliente ?? "",
      municipio: "",
      uf: "",
      status_documento: texto(detalhe?.xDesc) || "Evento",
      completude: "evento",
      json_dados: {
        origem: "ADN",
        nsu: doc.nsu,
        tipoEvento: chaveEvento ?? "",
        motivo: texto(detalhe?.xMotivo),
        chaveSubstituta: texto(detalhe?.chSubstituta),
      },
    };
  }

  // Schema fora do módulo: o chamador apenas avança o NSU.
  return null;
}
