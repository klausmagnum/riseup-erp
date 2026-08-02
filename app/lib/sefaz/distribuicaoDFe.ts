import { request as httpsRequest } from "node:https";
import { gunzipSync } from "node:zlib";
import { parseStringPromise } from "xml2js";
import { getUfCode } from "./ufCodes";

export type SefazEnvironment = "producao" | "homologacao";

/**
 * A SEFAZ tem um serviço de distribuição por família de documento: o da NF-e
 * entrega apenas modelos 55/65, e o do CT-e (NT 2015.002) apenas 57/67. São o
 * mesmo protocolo — distDFeInt paginado por NSU, docZip em base64+gzip — com
 * endpoint, namespace, ação SOAP e versão de schema próprios.
 *
 * Verificado contra o ambiente real: a distribuição da NF-e nunca devolveu um
 * CT-e, e o serviço do CT-e só aceita a versão 1.00 do distDFeInt.
 */
export type ServicoDistribuicao = "nfe" | "cte";

interface DefinicaoServico {
  endpoints: Record<SefazEnvironment, string>;
  action: string;
  namespace: string;
  wsdlNamespace: string;
  elemento: string;
  dadosMsg: string;
  resposta: string;
  resultado: string;
  versao: string;
}

const SERVICOS: Record<ServicoDistribuicao, DefinicaoServico> = {
  // É este — e não o NfeConsultacao4 — que entrega as notas EMITIDAS CONTRA o
  // CNPJ do cliente.
  nfe: {
    endpoints: {
      producao: "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
      homologacao: "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
    },
    action: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse",
    namespace: "http://www.portalfiscal.inf.br/nfe",
    wsdlNamespace: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe",
    elemento: "nfeDistDFeInteresse",
    dadosMsg: "nfeDadosMsg",
    resposta: "nfeDistDFeInteresseResponse",
    resultado: "nfeDistDFeInteresseResult",
    versao: "1.01",
  },
  cte: {
    endpoints: {
      producao: "https://www1.cte.fazenda.gov.br/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx",
      homologacao: "https://hom1.cte.fazenda.gov.br/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx",
    },
    action: "http://www.portalfiscal.inf.br/cte/wsdl/CTeDistribuicaoDFe/cteDistDFeInteresse",
    namespace: "http://www.portalfiscal.inf.br/cte",
    wsdlNamespace: "http://www.portalfiscal.inf.br/cte/wsdl/CTeDistribuicaoDFe",
    elemento: "cteDistDFeInteresse",
    dadosMsg: "cteDadosMsg",
    resposta: "cteDistDFeInteresseResponse",
    resultado: "cteDistDFeInteresseResult",
    versao: "1.00",
  },
};

// A SEFAZ devolve no máximo 50 documentos por chamada, independente do que se peça.
export const DOCS_POR_LOTE = 50;

/** cStat relevantes do retDistDFeInt. */
export const CSTAT = {
  LOTE_ENCONTRADO: "138",
  NENHUM_DOCUMENTO: "137",
  CONSUMO_INDEVIDO: "656",
} as const;

export interface DocumentoDistribuido {
  nsu: string;
  /** Nome do schema, ex.: "procNFe_v4.00.xsd" ou "resNFe_v1.01.xsd". */
  schema: string;
  /** XML já descompactado. */
  xml: string;
}

export interface ResultadoDistribuicao {
  cStat: string;
  xMotivo: string;
  /** Último NSU devolvido neste lote. */
  ultNSU: string;
  /** Maior NSU existente na SEFAZ — se for maior que ultNSU, há mais a buscar. */
  maxNSU: string;
  documentos: DocumentoDistribuido[];
}

export interface CertificadoA1 {
  /** Conteúdo do .pfx em memória. Nunca gravamos em disco. */
  pfx: Buffer;
  senha: string;
}

function montarEnvelope(params: {
  servico: DefinicaoServico;
  ambiente: SefazEnvironment;
  cnpj: string;
  cUFAutor: number;
  ultNSU: string;
}) {
  const { servico } = params;
  const tpAmb = params.ambiente === "producao" ? "1" : "2";
  const ultNSU = params.ultNSU.padStart(15, "0");

  // O distDFeInt vai como conteúdo literal dentro do elemento de dados.
  const distDFeInt =
    `<distDFeInt xmlns="${servico.namespace}" versao="${servico.versao}">` +
    `<tpAmb>${tpAmb}</tpAmb>` +
    `<cUFAutor>${params.cUFAutor}</cUFAutor>` +
    `<CNPJ>${params.cnpj}</CNPJ>` +
    `<distNSU><ultNSU>${ultNSU}</ultNSU></distNSU>` +
    `</distDFeInt>`;

  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap12:Body>` +
    `<${servico.elemento} xmlns="${servico.wsdlNamespace}">` +
    `<${servico.dadosMsg}>${distDFeInt}</${servico.dadosMsg}>` +
    `</${servico.elemento}>` +
    `</soap12:Body>` +
    `</soap12:Envelope>`
  );
}

function postSoap(
  endpoint: string,
  action: string,
  envelope: string,
  certificado: CertificadoA1,
  timeoutMs: number
): Promise<string> {
  const url = new URL(endpoint);
  const payload = Buffer.from(envelope, "utf8");

  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        host: url.hostname,
        path: url.pathname,
        method: "POST",
        // Autenticação mútua: o .pfx vai inteiro como PKCS#12.
        // Passar o mesmo arquivo em cert+key (como fazia a versão antiga)
        // quebra o handshake, porque essas opções esperam PEM.
        pfx: certificado.pfx,
        passphrase: certificado.senha,
        minVersion: "TLSv1.2",
        headers: {
          "Content-Type": `application/soap+xml; charset=utf-8; action="${action}"`,
          "Content-Length": payload.length,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`SEFAZ respondeu HTTP ${res.statusCode}: ${body.slice(0, 500)}`));
            return;
          }
          resolve(body);
        });
      }
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Timeout de ${timeoutMs}ms ao contatar a SEFAZ.`));
    });

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

/** Remove prefixo de namespace das tags, para não depender de soap12:/nfe:. */
function stripPrefix(name: string) {
  return name.replace(/^.*:/, "");
}

/**
 * Interpreta o envelope SOAP devolvido pela SEFAZ.
 *
 * Separado de buscarLoteDFe para poder ser exercitado sem rede nem certificado.
 */
export async function parseRetDistDFeInt(
  respostaXml: string,
  servico: ServicoDistribuicao = "nfe"
): Promise<ResultadoDistribuicao> {
  const definicao = SERVICOS[servico];

  const parsed = await parseStringPromise(respostaXml, {
    explicitArray: false,
    tagNameProcessors: [stripPrefix],
    ignoreAttrs: false,
  });

  const ret =
    parsed?.Envelope?.Body?.[definicao.resposta]?.[definicao.resultado]?.retDistDFeInt;

  if (!ret) {
    throw new Error(
      `Resposta da SEFAZ em formato inesperado: ${respostaXml.slice(0, 500)}`
    );
  }

  const documentos: DocumentoDistribuido[] = [];
  const lote = ret.loteDistDFeInt?.docZip;

  if (lote) {
    // Com um único documento o xml2js devolve objeto, não array.
    const itens = Array.isArray(lote) ? lote : [lote];

    for (const item of itens) {
      const conteudoBase64 = typeof item === "string" ? item : item._;
      if (!conteudoBase64) continue;

      // Cada docZip vem em base64 + gzip. A versão antiga não descompactava nada.
      const xml = gunzipSync(Buffer.from(conteudoBase64, "base64")).toString("utf8");

      documentos.push({
        nsu: item.$?.NSU ?? "",
        schema: item.$?.schema ?? "",
        xml,
      });
    }
  }

  return {
    cStat: String(ret.cStat ?? ""),
    xMotivo: String(ret.xMotivo ?? ""),
    ultNSU: String(ret.ultNSU ?? "0"),
    maxNSU: String(ret.maxNSU ?? "0"),
    documentos,
  };
}

/**
 * Busca um lote de documentos a partir do NSU informado.
 *
 * Devolve no máximo 50 documentos. Se maxNSU > ultNSU no retorno, ainda há
 * documentos a buscar — chame novamente passando o ultNSU recebido.
 */
export async function buscarLoteDFe(params: {
  cnpj: string;
  uf: string;
  ultNSU: string;
  certificado: CertificadoA1;
  ambiente?: SefazEnvironment;
  timeoutMs?: number;
  /** Família do documento. Cada uma tem seu serviço; ver SERVICOS. */
  servico?: ServicoDistribuicao;
}): Promise<ResultadoDistribuicao> {
  const ambiente = params.ambiente ?? "producao";
  const servico = params.servico ?? "nfe";
  const definicao = SERVICOS[servico];
  const cnpj = params.cnpj.replace(/\D/g, "");

  if (cnpj.length !== 14) {
    throw new Error(`CNPJ invalido para consulta na SEFAZ: "${params.cnpj}".`);
  }

  const envelope = montarEnvelope({
    servico: definicao,
    ambiente,
    cnpj,
    cUFAutor: getUfCode(params.uf),
    ultNSU: params.ultNSU || "0",
  });

  const respostaXml = await postSoap(
    definicao.endpoints[ambiente],
    definicao.action,
    envelope,
    params.certificado,
    // O serviço do CT-e respondeu 503 e timeout em tentativa recente; a folga
    // maior evita transformar instabilidade momentânea em erro do cliente.
    params.timeoutMs ?? 60_000
  );

  return parseRetDistDFeInt(respostaXml, servico);
}
