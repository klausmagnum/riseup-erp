/**
 * Verificação do pipeline de leitura da NFC-e.
 *
 * A NFC-e chega pela consulta por chave (consChNFe), não pela fila de NSU: o
 * ambiente nacional não distribui modelo 65. A resposta, porém, é o mesmo
 * retDistDFeInt da fila, então o que se verifica aqui é se um documento modelo
 * 65 atravessa o pipeline sendo reconhecido como NFC-e — e não como NF-e, que
 * era o comportamento antigo e mandava a venda a consumidor para a pasta
 * errada do Drive.
 *
 * Não usa rede nem certificado.
 *
 *   npx tsx scripts/verificar-nfce.mts
 */
import { gzipSync } from "node:zlib";
import { parseRetDistDFeInt } from "../app/lib/sefaz/distribuicaoDFe.ts";
import { normalizarDocumento, destrincharChave } from "../app/lib/sefaz/parseDocumento.ts";
import { chaveValida } from "../app/lib/sefaz/capturarPorChave.ts";

const CNPJ_LOJA = "12345678000199";
// Chave montada para o teste, com o dígito verificador calculado: o pipeline
// recusa chave com DV errado antes de gastar consulta na SEFAZ.
const CHAVE_NFCE = "35260712345678000199650010000012341123456780";
/** NF-e real já capturada pela fila, para provar que o modelo 55 não mudou. */
const CHAVE_NFE = "24260540778342000151550010003384091067518000";

function procNFe(chave: string, modelo: string) {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">` +
    `<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe${chave}" versao="4.00">` +
    `<ide><cUF>35</cUF><mod>${modelo}</mod><serie>1</serie><nNF>1234</nNF>` +
    `<dhEmi>2026-07-15T10:32:00-03:00</dhEmi><tpNF>1</tpNF></ide>` +
    `<emit><CNPJ>${CNPJ_LOJA}</CNPJ><xNome>MERCADO CENTRAL LTDA</xNome>` +
    `<enderEmit><xMun>Natal</xMun><UF>RN</UF></enderEmit></emit>` +
    `<dest><CPF>11122233344</CPF><xNome>CONSUMIDOR NAO IDENTIFICADO</xNome></dest>` +
    `<total><ICMSTot><vNF>247.35</vNF></ICMSTot></total>` +
    `</infNFe></NFe>` +
    `<protNFe><infProt><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe>` +
    `</nfeProc>`
  );
}

function procEvento(chave: string, tpEvento = "110111", nSeqEvento = "1") {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<procEventoNFe versao="1.00" xmlns="http://www.portalfiscal.inf.br/nfe">` +
    `<evento><infEvento Id="ID${tpEvento}${chave}0${nSeqEvento}"><CNPJ>${CNPJ_LOJA}</CNPJ>` +
    `<chNFe>${chave}</chNFe><dhEvento>2026-07-15T11:04:00-03:00</dhEvento>` +
    `<tpEvento>${tpEvento}</tpEvento><nSeqEvento>${nSeqEvento}</nSeqEvento>` +
    `<xEvento>Cancelamento</xEvento>` +
    `</infEvento></evento></procEventoNFe>`
  );
}

function docZip(xml: string, nsu: string, schema: string) {
  const conteudo = gzipSync(Buffer.from(xml, "utf8")).toString("base64");
  return `<docZip NSU="${nsu}" schema="${schema}">${conteudo}</docZip>`;
}

/**
 * Envelope da consulta por chave, no formato que a SEFAZ devolveu no ambiente
 * real: cStat 138 "Documento localizado", um docZip, e o NSU do documento.
 */
function envelope(docs: string, cStat = "138", xMotivo = "Documento localizado") {
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body>` +
    `<nfeDistDFeInteresseResponse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">` +
    `<nfeDistDFeInteresseResult>` +
    `<retDistDFeInt versao="1.01" xmlns="http://www.portalfiscal.inf.br/nfe">` +
    `<tpAmb>1</tpAmb><verAplic>1.0</verAplic><cStat>${cStat}</cStat><xMotivo>${xMotivo}</xMotivo>` +
    `<ultNSU>000000000001420</ultNSU><maxNSU>000000000001420</maxNSU>` +
    (docs ? `<loteDistDFeInt>${docs}</loteDistDFeInt>` : "") +
    `</retDistDFeInt></nfeDistDFeInteresseResult></nfeDistDFeInteresseResponse>` +
    `</soap:Body></soap:Envelope>`
  );
}

let passou = 0;
let falhou = 0;

function conferir(rotulo: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (ok) {
    passou += 1;
    console.log(`  ok    ${rotulo}`);
  } else {
    falhou += 1;
    console.log(
      `  FALHA ${rotulo}\n        esperado: ${JSON.stringify(esperado)}\n        obtido:   ${JSON.stringify(obtido)}`
    );
  }
}

console.log("digito verificador da chave");
// Vale a conta local porque cada consulta conta na cota do CNPJ na SEFAZ: uma
// chave digitada errado não pode virar consulta.
conferir("NF-e real capturada", chaveValida(CHAVE_NFE), true);
conferir("NFC-e de teste", chaveValida(CHAVE_NFCE), true);
conferir("CT-e real capturado", chaveValida("35260727203551000109570060000194791120729126"), true);
conferir("digito do meio trocado", chaveValida(CHAVE_NFE.slice(0, 30) + "9" + CHAVE_NFE.slice(31)), false);
conferir("DV trocado", chaveValida(CHAVE_NFE.slice(0, 43) + "1"), false);
conferir("chave curta", chaveValida(CHAVE_NFE.slice(0, 43)), false);
conferir("chave com pontuacao", chaveValida(CHAVE_NFE.replace(/(\d{4})/g, "$1 ")), true);

console.log("\nmodelo na chave");
conferir("modelo 65", destrincharChave(CHAVE_NFCE).modelo, "65");
conferir("modelo 55", destrincharChave(CHAVE_NFE).modelo, "55");
conferir("UF da chave", destrincharChave(CHAVE_NFCE).uf, "SP");
conferir("numero da chave", destrincharChave(CHAVE_NFCE).numero, "1234");

console.log("\nresposta da consulta por chave");

const lote = await parseRetDistDFeInt(
  envelope(
    docZip(procNFe(CHAVE_NFCE, "65"), "000000000001420", "procNFe_v4.00.xsd") +
      docZip(procEvento(CHAVE_NFCE), "000000000001421", "procEventoNFe_v1.00.xsd")
  )
);

conferir("cStat", lote.cStat, "138");
conferir("documentos no lote", lote.documentos.length, 2);
conferir("schema do primeiro", lote.documentos[0].schema, "procNFe_v4.00.xsd");
conferir("NSU do primeiro", lote.documentos[0].nsu, "000000000001420");

const nfce = await normalizarDocumento(lote.documentos[0], {
  cnpjCliente: CNPJ_LOJA,
  nomeCliente: "MERCADO CENTRAL LTDA",
});

conferir("tipo do modelo 65", nfce?.tipo_documento, "NFCe");
conferir("numero", nfce?.numero, "1234");
conferir("serie", nfce?.serie, "1");
conferir("chave", nfce?.chave_acesso, CHAVE_NFCE);
conferir("data de emissao", nfce?.data_emissao, "2026-07-15");
conferir("valor total", nfce?.valor_total, 247.35);
conferir("emitente", nfce?.emitente_cnpj_cpf, CNPJ_LOJA);
conferir("destinatario consumidor", nfce?.destinatario_cnpj_cpf, "11122233344");
conferir("completude", nfce?.completude, "completo");
conferir("UF", nfce?.uf, "RN");

const eventoNfce = await normalizarDocumento(lote.documentos[1], { cnpjCliente: CNPJ_LOJA });

// O evento não tem modelo próprio: ele carrega a chave da nota, e é o modelo
// dela que diz se o cancelamento é de NF-e ou de NFC-e.
conferir("tipo do evento de NFC-e", eventoNfce?.tipo_documento, "EventoNFCe");
conferir("completude do evento", eventoNfce?.completude, "evento");
conferir("chave do evento", eventoNfce?.chave_acesso, CHAVE_NFCE);

console.log("\nidentidade do evento");

// A deduplicação compara tipo e sequência: sem a sequência, a segunda carta de
// correção da mesma nota passaria por repetição da primeira e seria descartada.
const [cce1, cce2] = await Promise.all(
  ["1", "2"].map(async (seq) => {
    const lote = await parseRetDistDFeInt(
      envelope(docZip(procEvento(CHAVE_NFCE, "110110", seq), `00000000000200${seq}`, "procEventoNFe_v1.00.xsd"))
    );
    return normalizarDocumento(lote.documentos[0], { cnpjCliente: CNPJ_LOJA });
  })
);

conferir("tipo da primeira CC-e", cce1?.json_dados.tpEvento, "110110");
conferir("sequencia da primeira CC-e", cce1?.json_dados.nSeqEvento, "1");
conferir("sequencia da segunda CC-e", cce2?.json_dados.nSeqEvento, "2");
conferir("as duas CC-e sao distintas", cce1?.json_dados.nSeqEvento === cce2?.json_dados.nSeqEvento, false);

console.log("\nmodelo 55 nao pode ter mudado");

const loteNfe = await parseRetDistDFeInt(
  envelope(docZip(procNFe(CHAVE_NFE, "55"), "000000000001300", "procNFe_v4.00.xsd"))
);
const nfe = await normalizarDocumento(loteNfe.documentos[0], { cnpjCliente: CNPJ_LOJA });

conferir("tipo do modelo 55", nfe?.tipo_documento, "NFe");
conferir("completude do modelo 55", nfe?.completude, "completo");

const loteEventoNfe = await parseRetDistDFeInt(
  envelope(docZip(procEvento(CHAVE_NFE), "000000000001301", "procEventoNFe_v1.00.xsd"))
);
const eventoNfe = await normalizarDocumento(loteEventoNfe.documentos[0], {
  cnpjCliente: CNPJ_LOJA,
});

conferir("tipo do evento de NF-e", eventoNfe?.tipo_documento, "EventoNFe");

console.log("\nchave sem documento");

// Quando a SEFAZ não localiza a chave, ou recusa por não ser de interesse do
// CNPJ, o lote vem sem docZip. Quem chama precisa distinguir isso de erro.
const vazio = await parseRetDistDFeInt(
  envelope("", "137", "Nenhum documento localizado para o interessado")
);

conferir("cStat de nada encontrado", vazio.cStat, "137");
conferir("lote vazio", vazio.documentos.length, 0);

console.log(`\n${passou} passaram, ${falhou} falharam`);
process.exit(falhou === 0 ? 0 : 1);
