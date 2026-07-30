import { request as httpsRequest } from "node:https";
import { gunzipSync } from "node:zlib";
import { parseStringPromise } from "xml2js";
import { getUfCode } from "./ufCodes";

export type SefazEnvironment = "producao" | "homologacao";

// Serviço de distribuição de DF-e. É este — e não o NfeConsultacao4 — que
// entrega as notas EMITIDAS CONTRA o CNPJ do cliente.
const ENDPOINTS: Record<SefazEnvironment, string> = {
  producao: "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
  homologacao: "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
};

const SOAP_ACTION =
  "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse";

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
  ambiente: SefazEnvironment;
  cnpj: string;
  cUFAutor: number;
  ultNSU: string;
}) {
  const tpAmb = params.ambiente === "producao" ? "1" : "2";
  const ultNSU = params.ultNSU.padStart(15, "0");

  // O distDFeInt vai como conteúdo literal dentro de nfeDadosMsg.
  const distDFeInt =
    `<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">` +
    `<tpAmb>${tpAmb}</tpAmb>` +
    `<cUFAutor>${params.cUFAutor}</cUFAutor>` +
    `<CNPJ>${params.cnpj}</CNPJ>` +
    `<distNSU><ultNSU>${ultNSU}</ultNSU></distNSU>` +
    `</distDFeInt>`;

  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap12:Body>` +
    `<nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">` +
    `<nfeDadosMsg>${distDFeInt}</nfeDadosMsg>` +
    `</nfeDistDFeInteresse>` +
    `</soap12:Body>` +
    `</soap12:Envelope>`
  );
}

function postSoap(
  endpoint: string,
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
          "Content-Type": `application/soap+xml; charset=utf-8; action="${SOAP_ACTION}"`,
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
  respostaXml: string
): Promise<ResultadoDistribuicao> {
  const parsed = await parseStringPromise(respostaXml, {
    explicitArray: false,
    tagNameProcessors: [stripPrefix],
    ignoreAttrs: false,
  });

  const ret =
    parsed?.Envelope?.Body?.nfeDistDFeInteresseResponse?.nfeDistDFeInteresseResult
      ?.retDistDFeInt;

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
}): Promise<ResultadoDistribuicao> {
  const ambiente = params.ambiente ?? "producao";
  const cnpj = params.cnpj.replace(/\D/g, "");

  if (cnpj.length !== 14) {
    throw new Error(`CNPJ invalido para consulta na SEFAZ: "${params.cnpj}".`);
  }

  const envelope = montarEnvelope({
    ambiente,
    cnpj,
    cUFAutor: getUfCode(params.uf),
    ultNSU: params.ultNSU || "0",
  });

  const respostaXml = await postSoap(
    ENDPOINTS[ambiente],
    envelope,
    params.certificado,
    params.timeoutMs ?? 30_000
  );

  return parseRetDistDFeInt(respostaXml);
}
