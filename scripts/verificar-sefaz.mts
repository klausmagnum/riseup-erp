/**
 * Verificação do pipeline de leitura da distribuição de DF-e.
 *
 * Monta respostas no formato exato que a SEFAZ devolve — envelope SOAP com
 * docZip em base64+gzip — e confere se saem registros corretos do outro lado.
 * Não usa rede nem certificado, então roda a qualquer momento.
 *
 *   npx tsx scripts/verificar-sefaz.mts
 */
import { gzipSync } from "node:zlib";
import { parseRetDistDFeInt } from "../app/lib/sefaz/distribuicaoDFe.ts";
import { normalizarDocumento, destrincharChave } from "../app/lib/sefaz/parseDocumento.ts";

// cUF=24(RN) AAMM=2507 CNPJ=12345678000199 mod=55 serie=001 nNF=000001234 ...
const CHAVE = "24250712345678000199550010000012341123456780";
const CNPJ_CLIENTE = "98765432000188";

let passou = 0;
let falhou = 0;

function conferir(rotulo: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (ok) {
    passou += 1;
    console.log(`  ok   ${rotulo}`);
  } else {
    falhou += 1;
    console.log(`  FALHA ${rotulo}\n        esperado: ${JSON.stringify(esperado)}\n        obtido:   ${JSON.stringify(obtido)}`);
  }
}

function envelope(docs: Array<{ nsu: string; schema: string; xml: string }>, extras: { cStat: string; xMotivo: string; ultNSU: string; maxNSU: string }) {
  const docZips = docs
    .map(
      (d) =>
        `<docZip NSU="${d.nsu}" schema="${d.schema}">${gzipSync(Buffer.from(d.xml, "utf8")).toString("base64")}</docZip>`
    )
    .join("");

  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
  <soap:Body>
    <nfeDistDFeInteresseResponse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDistDFeInteresseResult>
        <retDistDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
          <tpAmb>1</tpAmb>
          <verAplic>1.0</verAplic>
          <cStat>${extras.cStat}</cStat>
          <xMotivo>${extras.xMotivo}</xMotivo>
          <dhResp>2026-07-30T09:00:00-03:00</dhResp>
          <ultNSU>${extras.ultNSU}</ultNSU>
          <maxNSU>${extras.maxNSU}</maxNSU>
          ${docZips ? `<loteDistDFeInt>${docZips}</loteDistDFeInt>` : ""}
        </retDistDFeInt>
      </nfeDistDFeInteresseResult>
    </nfeDistDFeInteresseResponse>
  </soap:Body>
</soap:Envelope>`;
}

const XML_RESUMO = `<resNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
  <chNFe>${CHAVE}</chNFe>
  <CNPJ>12345678000199</CNPJ>
  <xNome>FORNECEDOR EXEMPLO LTDA</xNome>
  <IE>123456789</IE>
  <dhEmi>2026-07-15T10:30:00-03:00</dhEmi>
  <tpNF>1</tpNF>
  <vNF>1547.90</vNF>
  <digVal>Ab1Cd2Ef3</digVal>
  <dhRecbto>2026-07-15T10:35:00-03:00</dhRecbto>
  <cSitNFe>1</cSitNFe>
</resNFe>`;

const XML_COMPLETO = `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe${CHAVE}" versao="4.00">
      <ide><nNF>1234</nNF><serie>1</serie><dhEmi>2026-07-15T10:30:00-03:00</dhEmi></ide>
      <emit>
        <CNPJ>12345678000199</CNPJ>
        <xNome>FORNECEDOR EXEMPLO LTDA</xNome>
        <enderEmit><xMun>Natal</xMun><UF>RN</UF></enderEmit>
      </emit>
      <dest><CNPJ>${CNPJ_CLIENTE}</CNPJ><xNome>CLIENTE TF LTDA</xNome></dest>
      <total><ICMSTot><vNF>1547.90</vNF></ICMSTot></total>
    </infNFe>
  </NFe>
  <protNFe><infProt><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe>
</nfeProc>`;

const XML_EVENTO = `<procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
  <evento>
    <infEvento>
      <chNFe>${CHAVE}</chNFe>
      <CNPJ>12345678000199</CNPJ>
      <dhEvento>2026-07-16T14:00:00-03:00</dhEvento>
      <tpEvento>110111</tpEvento>
      <xEvento>Cancelamento</xEvento>
    </infEvento>
  </evento>
</procEventoNFe>`;

console.log("\n1. Leitura da chave de acesso (o resumo nao traz numero nem serie)");
{
  const d = destrincharChave(CHAVE);
  conferir("UF derivada do codigo 24", d.uf, "RN");
  conferir("modelo", d.modelo, "55");
  conferir("serie sem zeros a esquerda", d.serie, "1");
  conferir("numero sem zeros a esquerda", d.numero, "1234");
  conferir("chave invalida nao quebra", destrincharChave("123").uf, "");
}

console.log("\n2. Envelope SOAP com docZip (base64 + gzip)");
{
  const soap = envelope(
    [
      { nsu: "000000000000101", schema: "resNFe_v1.01.xsd", xml: XML_RESUMO },
      { nsu: "000000000000102", schema: "procNFe_v4.00.xsd", xml: XML_COMPLETO },
    ],
    { cStat: "138", xMotivo: "Documento localizado", ultNSU: "000000000000102", maxNSU: "000000000000350" }
  );

  const r = await parseRetDistDFeInt(soap);
  conferir("cStat", r.cStat, "138");
  conferir("ultNSU", r.ultNSU, "000000000000102");
  conferir("maxNSU indica que ha mais a buscar", Number(r.maxNSU) > Number(r.ultNSU), true);
  conferir("quantidade de documentos", r.documentos.length, 2);
  conferir("NSU do primeiro", r.documentos[0].nsu, "000000000000101");
  conferir("schema do primeiro", r.documentos[0].schema, "resNFe_v1.01.xsd");
  conferir("gzip descompactado", r.documentos[0].xml.includes("FORNECEDOR EXEMPLO"), true);
}

console.log("\n3. Lote com um unico documento (xml2js devolve objeto, nao array)");
{
  const soap = envelope(
    [{ nsu: "000000000000101", schema: "resNFe_v1.01.xsd", xml: XML_RESUMO }],
    { cStat: "138", xMotivo: "Documento localizado", ultNSU: "000000000000101", maxNSU: "000000000000101" }
  );

  const r = await parseRetDistDFeInt(soap);
  conferir("documento unico e lido", r.documentos.length, 1);
  conferir("fim da fila detectado", Number(r.ultNSU) >= Number(r.maxNSU), true);
}

console.log("\n4. Resposta sem documentos (cStat 137)");
{
  const soap = envelope([], {
    cStat: "137",
    xMotivo: "Nenhum documento localizado",
    ultNSU: "000000000000350",
    maxNSU: "000000000000350",
  });

  const r = await parseRetDistDFeInt(soap);
  conferir("cStat 137", r.cStat, "137");
  conferir("lista vazia", r.documentos.length, 0);
}

console.log("\n5. Normalizacao do RESUMO (resNFe)");
{
  const doc = { nsu: "000000000000101", schema: "resNFe_v1.01.xsd", xml: XML_RESUMO };
  const n = await normalizarDocumento(doc, { cnpjCliente: CNPJ_CLIENTE, nomeCliente: "CLIENTE TF LTDA" });

  conferir("chave", n?.chave_acesso, CHAVE);
  conferir("numero veio da chave", n?.numero, "1234");
  conferir("serie veio da chave", n?.serie, "1");
  conferir("data de emissao normalizada", n?.data_emissao, "2026-07-15");
  conferir("valor total", n?.valor_total, 1547.9);
  conferir("emitente", n?.emitente_nome, "FORNECEDOR EXEMPLO LTDA");
  conferir("destinatario e o proprio cliente", n?.destinatario_cnpj_cpf, CNPJ_CLIENTE);
  conferir("marcado como resumo", n?.completude, "resumo");
  conferir("digVal guardado para manifestacao", (n?.json_dados as any)?.digVal, "Ab1Cd2Ef3");
}

console.log("\n6. Normalizacao da NOTA COMPLETA (procNFe)");
{
  const doc = { nsu: "000000000000102", schema: "procNFe_v4.00.xsd", xml: XML_COMPLETO };
  const n = await normalizarDocumento(doc, { cnpjCliente: CNPJ_CLIENTE, nomeCliente: "CLIENTE TF LTDA" });

  conferir("chave sem o prefixo NFe do atributo Id", n?.chave_acesso, CHAVE);
  conferir("numero do campo proprio", n?.numero, "1234");
  conferir("municipio do emitente", n?.municipio, "Natal");
  conferir("uf do emitente", n?.uf, "RN");
  conferir("destinatario real do XML", n?.destinatario_nome, "CLIENTE TF LTDA");
  conferir("status vindo do protocolo", n?.status_documento, "Autorizado o uso da NF-e");
  conferir("marcado como completo", n?.completude, "completo");
}

console.log("\n7. Normalizacao de EVENTO (cancelamento)");
{
  const doc = { nsu: "000000000000103", schema: "procEventoNFe_v1.00.xsd", xml: XML_EVENTO };
  const n = await normalizarDocumento(doc, { cnpjCliente: CNPJ_CLIENTE });

  conferir("tipo do documento", n?.tipo_documento, "EventoNFe");
  conferir("chave da nota afetada", n?.chave_acesso, CHAVE);
  conferir("descricao do evento", n?.status_documento, "Cancelamento");
  conferir("marcado como evento", n?.completude, "evento");
}

console.log("\n8. Schema desconhecido e ignorado sem quebrar");
{
  const doc = { nsu: "000000000000104", schema: "outro_v1.00.xsd", xml: "<outroDoc><a>1</a></outroDoc>" };
  const n = await normalizarDocumento(doc, { cnpjCliente: CNPJ_CLIENTE });
  conferir("retorna null", n, null);
}

console.log(`\n${"=".repeat(52)}`);
console.log(`  ${passou} passaram, ${falhou} falharam`);
console.log(`${"=".repeat(52)}\n`);

process.exit(falhou > 0 ? 1 : 0);
