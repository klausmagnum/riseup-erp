import { request as httpsRequest } from "node:https";
import { gunzipSync } from "node:zlib";
import { parseStringPromise } from "xml2js";
import { getUfCode } from "./ufCodes";
import { autoridadesComIcpBrasil } from "./icpBrasil";

export type SefazEnvironment = "producao" | "homologacao";

/**
 * A SEFAZ tem um serviço de distribuição por família de documento: o da NF-e
 * atende os modelos 55/65, o do CT-e (NT 2015.002) os modelos 57/67 e o da
 * MDF-e o modelo 58. São o mesmo protocolo — distDFeInt, docZip em base64+gzip
 * — com endpoint, namespace, ação SOAP e versão de schema próprios.
 *
 * Verificado contra o ambiente real: a distribuição da NF-e nunca devolveu um
 * CT-e, e o serviço do CT-e só aceita a versão 1.00 do distDFeInt. A fila da
 * NF-e também nunca devolveu modelo 65 — a NFC-e é autorizada na SEFAZ
 * estadual e não entra na fila nacional, e por isso só se chega a ela pela
 * consulta por chave.
 *
 * O da MDF-e é o mais diferente dos três, e as diferenças estão no schema
 * publicado pela SVRS (distDFeInt_v1.00.xsd do pacote PRMDF): o pedido não tem
 * cUFAutor, e não existe consulta por chave — só a fila por NSU. Também é o
 * único hospedado na SVRS em vez do ambiente nacional da Receita, e, como todo
 * serviço da SVRS, espera o cabeçalho SOAP com a UF e a versão dos dados.
 */
export type ServicoDistribuicao = "nfe" | "cte" | "mdfe";

interface DefinicaoServico {
  endpoints: Record<SefazEnvironment, string>;
  action: string;
  namespace: string;
  wsdlNamespace: string;
  /** Elemento que embrulha o dadosMsg. Nulo quando o corpo começa nele mesmo. */
  elemento: string | null;
  dadosMsg: string;
  /** Cabeçalho SOAP com cUF e versaoDados, exigido pelos serviços da SVRS. */
  cabecalho: string | null;
  versao: string;
  /** O pedido leva a UF de quem consulta. A MDF-e não tem esse campo. */
  cUFAutor: boolean;
  /** Servidor certificado pela ICP-Brasil, que não está nas CAs do Node. */
  icpBrasil?: boolean;
  /** Elemento da consulta por chave, e a tag da chave dentro dele. */
  consultaChave: { elemento: string; chave: string } | null;
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
    cabecalho: null,
    versao: "1.01",
    cUFAutor: true,
    consultaChave: { elemento: "consChNFe", chave: "chNFe" },
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
    cabecalho: null,
    versao: "1.00",
    cUFAutor: true,
    consultaChave: { elemento: "consChCTe", chave: "chCTe" },
  },
  // A MDF-e é autorizada pela SVRS para todas as UFs, e é lá que fica a
  // distribuição dela — não no ambiente nacional da Receita, como as outras.
  mdfe: {
    endpoints: {
      producao: "https://mdfe.svrs.rs.gov.br/ws/MDFeDistribuicaoDFe/MDFeDistribuicaoDFe.asmx",
      homologacao:
        "https://mdfe-homologacao.svrs.rs.gov.br/ws/MDFeDistribuicaoDFe/MDFeDistribuicaoDFe.asmx",
    },
    action: "http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeDistribuicaoDFe/mdfeDistDFeInteresse",
    namespace: "http://www.portalfiscal.inf.br/mdfe",
    wsdlNamespace: "http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeDistribuicaoDFe",
    // O corpo do serviço da SVRS começa no próprio dadosMsg: não há elemento de
    // operação embrulhando, como têm a NF-e e o CT-e.
    elemento: null,
    dadosMsg: "mdfeDadosMsg",
    cabecalho: "mdfeCabecMsg",
    versao: "1.00",
    cUFAutor: false,
    // O servidor da SVRS é da cadeia da ICP-Brasil, que o Node não conhece.
    icpBrasil: true,
    consultaChave: null,
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

/**
 * O distDFeInt aceita um critério de busca por vez: ou a fila por NSU, que
 * varre tudo que a origem tem para o CNPJ, ou uma chave de acesso específica.
 */
export type CriterioBusca =
  | { tipo: "fila"; ultNSU: string }
  | { tipo: "chave"; chave: string };

function montarEnvelope(params: {
  servico: DefinicaoServico;
  ambiente: SefazEnvironment;
  cnpj: string;
  cUFAutor: number;
  criterio: CriterioBusca;
}) {
  const { servico, criterio } = params;
  const tpAmb = params.ambiente === "producao" ? "1" : "2";

  let busca: string;

  if (criterio.tipo === "fila") {
    busca = `<distNSU><ultNSU>${criterio.ultNSU.padStart(15, "0")}</ultNSU></distNSU>`;
  } else {
    const porChave = servico.consultaChave;

    // A MDF-e só tem fila por NSU. Pedir uma chave aqui é erro de programação,
    // não recusa da SEFAZ: o pedido nem chega a sair.
    if (!porChave) {
      throw new Error(
        "Este servico de distribuicao so aceita a fila por NSU; nao ha consulta por chave."
      );
    }

    busca =
      `<${porChave.elemento}>` +
      `<${porChave.chave}>${criterio.chave}</${porChave.chave}>` +
      `</${porChave.elemento}>`;
  }

  // O distDFeInt vai como conteúdo literal dentro do elemento de dados. A ordem
  // dos campos é a do schema, e a SEFAZ rejeita fora dela.
  const distDFeInt =
    `<distDFeInt xmlns="${servico.namespace}" versao="${servico.versao}">` +
    `<tpAmb>${tpAmb}</tpAmb>` +
    (servico.cUFAutor ? `<cUFAutor>${params.cUFAutor}</cUFAutor>` : "") +
    `<CNPJ>${params.cnpj}</CNPJ>` +
    busca +
    `</distDFeInt>`;

  // Sem elemento de operação, é o dadosMsg que declara o namespace do serviço.
  const corpo = servico.elemento
    ? `<${servico.elemento} xmlns="${servico.wsdlNamespace}">` +
      `<${servico.dadosMsg}>${distDFeInt}</${servico.dadosMsg}>` +
      `</${servico.elemento}>`
    : `<${servico.dadosMsg} xmlns="${servico.wsdlNamespace}">${distDFeInt}</${servico.dadosMsg}>`;

  const cabecalho = servico.cabecalho
    ? `<soap12:Header>` +
      `<${servico.cabecalho} xmlns="${servico.wsdlNamespace}">` +
      `<cUF>${params.cUFAutor}</cUF>` +
      `<versaoDados>${servico.versao}</versaoDados>` +
      `</${servico.cabecalho}>` +
      `</soap12:Header>`
    : "";

  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    cabecalho +
    `<soap12:Body>${corpo}</soap12:Body>` +
    `</soap12:Envelope>`
  );
}

function postSoap(
  endpoint: string,
  action: string,
  envelope: string,
  certificado: CertificadoA1,
  timeoutMs: number,
  /** CAs aceitas para o servidor. Vazio usa as que o Node já traz. */
  autoridades?: string[]
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
        ...(autoridades ? { ca: autoridades } : {}),
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
 * Procura o retDistDFeInt onde quer que ele esteja no envelope.
 *
 * Cada serviço embrulha o retorno com nomes próprios — nfeDistDFeInteresseResult,
 * cteDistDFeInteresseResult, mdfeDistDFeInteresseResult —, e o da MDF-e fica na
 * SVRS, que só serve o WSDL a quem apresenta certificado. Procurar pelo conteúdo
 * é o que dispensa acertar de antemão um envelope que não dá para conferir.
 */
function acharRetorno(no: unknown): Record<string, unknown> | null {
  if (!no || typeof no !== "object") return null;

  const registro = no as Record<string, unknown>;
  const ret = registro.retDistDFeInt;
  if (ret && typeof ret === "object") return ret as Record<string, unknown>;

  for (const valor of Object.values(registro)) {
    const achado = acharRetorno(valor);
    if (achado) return achado;
  }

  return null;
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

  const ret = acharRetorno(parsed?.Envelope?.Body ?? parsed);

  if (!ret) {
    throw new Error(
      `Resposta da SEFAZ em formato inesperado: ${respostaXml.slice(0, 500)}`
    );
  }

  const documentos: DocumentoDistribuido[] = [];
  const lote = (ret.loteDistDFeInt as { docZip?: unknown } | undefined)?.docZip;

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
  return chamarDistribuicao({
    ...params,
    criterio: { tipo: "fila", ultNSU: params.ultNSU || "0" },
  });
}

/**
 * Busca uma chave de acesso específica, sem passar pela fila de NSU.
 *
 * É o único caminho nacional para a NFC-e: o modelo 65 não é distribuído por
 * NSU — a venda a consumidor é autorizada na SEFAZ estadual e não entra na fila
 * do ambiente nacional. Quem tem a chave (do PDV, do portal estadual, do DANFE)
 * chega ao XML integral por aqui.
 *
 * A SEFAZ só entrega a quem é parte do documento, e a autenticação é o próprio
 * certificado: pedir a chave de um terceiro é recusado com cStat próprio, que
 * devolvemos como veio em vez de traduzir para "erro".
 */
export async function consultarChaveDFe(params: {
  cnpj: string;
  uf: string;
  chave: string;
  certificado: CertificadoA1;
  ambiente?: SefazEnvironment;
  timeoutMs?: number;
  servico?: ServicoDistribuicao;
}): Promise<ResultadoDistribuicao> {
  const chave = params.chave.replace(/\D/g, "");

  if (chave.length !== 44) {
    throw new Error(
      `Chave de acesso deve ter 44 digitos; recebida com ${chave.length}: "${params.chave}".`
    );
  }

  return chamarDistribuicao({ ...params, criterio: { tipo: "chave", chave } });
}

async function chamarDistribuicao(params: {
  cnpj: string;
  uf: string;
  criterio: CriterioBusca;
  certificado: CertificadoA1;
  ambiente?: SefazEnvironment;
  timeoutMs?: number;
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
    criterio: params.criterio,
  });

  const respostaXml = await postSoap(
    definicao.endpoints[ambiente],
    definicao.action,
    envelope,
    params.certificado,
    // O serviço do CT-e respondeu 503 e timeout em tentativa recente; a folga
    // maior evita transformar instabilidade momentânea em erro do cliente.
    params.timeoutMs ?? 60_000,
    definicao.icpBrasil ? autoridadesComIcpBrasil() : undefined
  );

  return parseRetDistDFeInt(respostaXml);
}
