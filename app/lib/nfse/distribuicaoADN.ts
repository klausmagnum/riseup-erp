import { request as httpsRequest } from "node:https";
import { gunzipSync } from "node:zlib";
import type { CertificadoA1 } from "../sefaz/distribuicaoDFe";

/**
 * Distribuição de NFS-e pelo Ambiente de Dados Nacional (ADN).
 *
 * Desde 01/05/2026 Natal emite pelo Emissor Nacional, e o ADN entrega por uma
 * fila incremental de NSU — o mesmo desenho da distribuição de DF-e da SEFAZ,
 * só que em REST/JSON com mTLS em vez de SOAP.
 *
 * O contrato abaixo foi levantado contra o ambiente real; ver
 * scripts/descobrir-nfse-nacional.mts, que reproduz a chamada.
 */

export type AmbienteADN = "producao" | "homologacao";

const HOSTS: Record<AmbienteADN, string> = {
  producao: "adn.nfse.gov.br",
  homologacao: "adn.producaorestrita.nfse.gov.br",
};

/** O ADN devolve no máximo 50 documentos por chamada. */
export const DOCS_POR_LOTE = 50;

/**
 * O ambiente nacional responde 429 a consumo repetido — foi o que aconteceu
 * ao terceiro pedido seguido durante o levantamento. Sem respeitar uma janela,
 * o cron transformaria isso em bloqueio permanente.
 */
export const JANELA_BLOQUEIO_MS = 61 * 60 * 1000;

export interface DocumentoADN {
  nsu: string;
  /** "NFSE" ou "EVENTO". */
  tipo: string;
  chaveAcesso: string;
  /** XML já descompactado. */
  xml: string;
  dataHoraGeracao: string | null;
}

export interface ResultadoADN {
  /** "DOCUMENTOS_LOCALIZADOS" e afins, como o ADN devolve. */
  status: string;
  documentos: DocumentoADN[];
  /** Maior NSU deste lote. */
  ultNSU: string;
  /** True quando o ADN recusou por excesso de consumo (HTTP 429). */
  bloqueado: boolean;
  mensagem: string;
}

interface RespostaHttp {
  status: number;
  corpo: Buffer;
}

function get(
  host: string,
  caminho: string,
  certificado: CertificadoA1,
  timeoutMs: number
): Promise<RespostaHttp> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        host,
        path: caminho,
        method: "GET",
        pfx: certificado.pfx,
        passphrase: certificado.senha,
        headers: { Accept: "application/json" },
        timeout: timeoutMs,
      },
      (res) => {
        const pedacos: Buffer[] = [];
        res.on("data", (d: Buffer) => pedacos.push(d));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, corpo: Buffer.concat(pedacos) })
        );
      }
    );

    req.on("timeout", () => req.destroy(new Error(`Tempo esgotado (${timeoutMs}ms) no ADN.`)));
    req.on("error", reject);
    req.end();
  });
}

interface ItemLote {
  NSU: number | string;
  ChaveAcesso?: string;
  TipoDocumento?: string;
  ArquivoXml?: string;
  DataHoraGeracao?: string;
}

interface EnvelopeADN {
  StatusProcessamento?: string;
  LoteDFe?: ItemLote[];
  Erros?: Array<{ Codigo?: string; Descricao?: string }> | null;
  Alertas?: Array<{ Codigo?: string; Descricao?: string }> | null;
}

/**
 * Converte o corpo JSON do ADN em documentos com o XML já descompactado.
 *
 * Separado da chamada de rede para poder ser exercitado com payload gravado,
 * sem certificado — é o que scripts/verificar-nfse.mts faz.
 */
export function parseEnvelopeADN(corpo: string): ResultadoADN {
  const envelope = JSON.parse(corpo) as EnvelopeADN;
  const lote = envelope.LoteDFe ?? [];

  const documentos: DocumentoADN[] = [];

  for (const item of lote) {
    if (!item.ArquivoXml) continue;

    // O ArquivoXml vem em base64 de gzip, igual ao docZip da NF-e.
    const xml = gunzipSync(Buffer.from(item.ArquivoXml, "base64")).toString("utf8");

    documentos.push({
      nsu: String(item.NSU ?? ""),
      tipo: item.TipoDocumento ?? "",
      chaveAcesso: item.ChaveAcesso ?? "",
      xml,
      dataHoraGeracao: item.DataHoraGeracao ?? null,
    });
  }

  const maior = documentos.reduce(
    (maximo, d) => (Number(d.nsu) > Number(maximo) ? d.nsu : maximo),
    "0"
  );

  const erros = (envelope.Erros ?? [])
    .map((e) => [e.Codigo, e.Descricao].filter(Boolean).join(" - "))
    .filter(Boolean);

  return {
    status: envelope.StatusProcessamento ?? "",
    documentos,
    ultNSU: maior,
    bloqueado: false,
    mensagem: erros.join("; "),
  };
}

/**
 * Traduz a resposta HTTP do ADN em resultado da distribuição.
 *
 * Separado da rede para ser exercitado com respostas gravadas do ambiente
 * real — é o que scripts/verificar-nfse.mts faz.
 */
export function interpretarRespostaADN(status: number, corpo: string): ResultadoADN {
  if (status === 429) {
    return {
      status: "CONSUMO_EXCEDIDO",
      documentos: [],
      ultNSU: "0",
      bloqueado: true,
      mensagem: "O ambiente nacional recusou por excesso de consultas (HTTP 429).",
    };
  }

  // Fim da fila. O ADN responde 404 quando não há documento a partir do NSU
  // pedido — não é falha, é a condição normal de parada, e tratá-la como erro
  // fazia toda sincronização bem-sucedida terminar marcada como "Erro".
  if (status === 404 && /NENHUM_DOCUMENTO_LOCALIZADO|E2220/.test(corpo)) {
    return {
      status: "NENHUM_DOCUMENTO_LOCALIZADO",
      documentos: [],
      ultNSU: "0",
      bloqueado: false,
      mensagem: "",
    };
  }

  if (status < 200 || status >= 300) {
    throw new Error(`ADN respondeu HTTP ${status}. ${corpo.slice(0, 300)}`);
  }

  return parseEnvelopeADN(corpo);
}

/** Busca um lote a partir do NSU informado. */
export async function buscarLoteADN(params: {
  ultNSU: string;
  certificado: CertificadoA1;
  ambiente?: AmbienteADN;
  timeoutMs?: number;
}): Promise<ResultadoADN> {
  const ambiente = params.ambiente ?? "producao";
  const host = HOSTS[ambiente];
  const nsu = Number(params.ultNSU) || 0;

  const resposta = await get(
    host,
    `/contribuintes/DFe/${nsu}`,
    params.certificado,
    params.timeoutMs ?? 60_000
  );

  return interpretarRespostaADN(resposta.status, resposta.corpo.toString("utf8"));
}
