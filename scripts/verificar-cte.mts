/**
 * Verificação do pipeline de leitura do CT-e.
 *
 * Monta o envelope no formato exato que o CTeDistribuicaoDFe devolve, a partir
 * de XML capturado do ambiente real, e confere o que sai do outro lado. Não
 * usa rede nem certificado.
 *
 *   npx tsx scripts/verificar-cte.mts
 */
import { gzipSync } from "node:zlib";
import { parseRetDistDFeInt } from "../app/lib/sefaz/distribuicaoDFe.ts";
import { normalizarDocumentoCTe } from "../app/lib/sefaz/parseCTe.ts";

const CNPJ_CLIENTE = "49039801000150";
const CHAVE_CTE = "35260503007331007235570011310599701373343595";
const CNPJ_TRANSPORTADORA = "03007331007235";
const CNPJ_REMETENTE = "34660006000107";

/** CT-e real: frete pago pelo remetente, com o cliente como destinatário. */
const XML_CTE = `<?xml version="1.0" encoding="UTF-8"?><cteProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/cte"><CTe xmlns="http://www.portalfiscal.inf.br/cte"><infCte Id="CTe${CHAVE_CTE}" versao="4.00"><ide><cUF>35</cUF><CFOP>6353</CFOP><natOp>PRESTAÇÕES DE SERVIÇOS DE TRANSPORTE</natOp><mod>57</mod><serie>1</serie><nCT>131059970</nCT><dhEmi>2026-05-05T17:35:49-03:00</dhEmi><tpAmb>1</tpAmb><tpCTe>0</tpCTe><cMunEnv>3505708</cMunEnv><xMunEnv>Barueri</xMunEnv><UFEnv>SP</UFEnv><modal>01</modal><tpServ>0</tpServ><cMunIni>3513009</cMunIni><xMunIni>Cotia</xMunIni><UFIni>SP</UFIni><cMunFim>2407104</cMunFim><xMunFim>Macaiba</xMunFim><UFFim>RN</UFFim><toma3><toma>0</toma></toma3></ide><emit><CNPJ>${CNPJ_TRANSPORTADORA}</CNPJ><xNome>EBAZARCOMBR LTDA</xNome><enderEmit><xLgr>Rua Jussara</xLgr><cMun>3505708</cMun><xMun>Barueri</xMun><UF>SP</UF></enderEmit></emit><rem><CNPJ>${CNPJ_REMETENTE}</CNPJ><xNome>JW ACESSORIOS LTDA</xNome></rem><dest><CNPJ>${CNPJ_CLIENTE}</CNPJ><xNome>Geowellex Pesquisa Desenvolvimento E Inovacao Ltda</xNome></dest><vPrest><vTPrest>56.70</vTPrest><vRec>56.70</vRec></vPrest><infCTeNorm><infCarga><vCarga>1360.00</vCarga></infCarga></infCTeNorm></infCte></CTe><protCTe versao="4.00"><infProt><cStat>100</cStat><xMotivo>Autorizado o uso do $APP_NAME_FORMATED$</xMotivo></infProt></protCTe></cteProc>`;

/** O mesmo CT-e, mas com o cliente como tomador — gera crédito. */
const XML_CTE_TOMADOR = XML_CTE.replace(
  `<toma3><toma>0</toma></toma3>`,
  `<toma3><toma>3</toma></toma3>`
);

const XML_EVENTO = `<?xml version="1.0" encoding="UTF-8"?><procEventoCTe versao="4.00" xmlns="http://www.portalfiscal.inf.br/cte"><eventoCTe versao="4.00"><infEvento Id="ID110111${CHAVE_CTE}01"><cOrgao>35</cOrgao><tpAmb>1</tpAmb><CNPJ>${CNPJ_TRANSPORTADORA}</CNPJ><chCTe>${CHAVE_CTE}</chCTe><dhEvento>2026-05-06T09:12:00-03:00</dhEvento><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento><detEvento versaoEvento="4.00"><evCancCTe><descEvento>Cancelamento</descEvento><nProt>135260000000001</nProt><xJust>Erro na emissao</xJust></evCancCTe></detEvento></infEvento></eventoCTe></procEventoCTe>`;

function docZip(xml: string, nsu: string, schema: string) {
  const conteudo = gzipSync(Buffer.from(xml, "utf8")).toString("base64");
  return `<docZip NSU="${nsu}" schema="${schema}">${conteudo}</docZip>`;
}

function envelope(docs: string, cStat = "138", ultNSU = "000000000000377") {
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body>` +
    `<cteDistDFeInteresseResponse xmlns="http://www.portalfiscal.inf.br/cte/wsdl/CTeDistribuicaoDFe">` +
    `<cteDistDFeInteresseResult>` +
    `<retDistDFeInt versao="1.00" xmlns="http://www.portalfiscal.inf.br/cte">` +
    `<tpAmb>1</tpAmb><verAplic>1.0</verAplic><cStat>${cStat}</cStat>` +
    `<xMotivo>documento localizado.</xMotivo>` +
    `<ultNSU>${ultNSU}</ultNSU><maxNSU>000000000000421</maxNSU>` +
    `<loteDistDFeInt>${docs}</loteDistDFeInt>` +
    `</retDistDFeInt></cteDistDFeInteresseResult></cteDistDFeInteresseResponse>` +
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

console.log("envelope do CTeDistribuicaoDFe");

const lote = await parseRetDistDFeInt(
  envelope(
    docZip(XML_CTE, "000000000000328", "procCTe_v4.00.xsd") +
      docZip(XML_EVENTO, "000000000000340", "procEventoCTe_v4.00.xsd")
  )
);

conferir("cStat", lote.cStat, "138");
conferir("documentos no lote", lote.documentos.length, 2);
conferir("ultNSU", lote.ultNSU, "000000000000377");
conferir("maxNSU", lote.maxNSU, "000000000000421");
conferir("schema do primeiro", lote.documentos[0].schema, "procCTe_v4.00.xsd");
conferir("XML descompactado", lote.documentos[0].xml.startsWith("<?xml"), true);

console.log("\nCT-e com frete pago pelo remetente");
const cte = await normalizarDocumentoCTe(lote.documentos[0], {
  cnpjCliente: CNPJ_CLIENTE,
  nomeCliente: "GEOWELLEX",
});
const dados = cte?.json_dados as Record<string, unknown>;

conferir("tipo do documento", cte?.tipo_documento, "CTe");
conferir("numero", cte?.numero, "131059970");
conferir("serie", cte?.serie, "1");
conferir("chave com 44 digitos", cte?.chave_acesso.length, 44);
conferir("modelo 57 na chave", cte?.chave_acesso.slice(20, 22), "57");
conferir("data de emissao", cte?.data_emissao, "2026-05-05");
conferir("valor do frete", cte?.valor_total, 56.7);
// O emitente do CT-e e a transportadora: e o que faz o painel classificar
// como entrada, ja que nao e o proprio cliente.
conferir("emitente e a transportadora", cte?.emitente_cnpj_cpf, CNPJ_TRANSPORTADORA);
conferir("destinatario e o cliente", cte?.destinatario_cnpj_cpf, CNPJ_CLIENTE);
conferir("municipio do emitente", cte?.municipio, "Barueri");
conferir("UF do emitente", cte?.uf, "SP");
conferir("completude", cte?.completude, "completo");
conferir("tomador e o remetente", dados?.tomadorPapel, "Remetente");
conferir("CNPJ do tomador", dados?.tomadorCnpj, CNPJ_REMETENTE);
conferir("cliente nao paga o frete", dados?.clienteEhTomador, false);
conferir("percurso de origem", dados?.origem, "Cotia/SP");
conferir("percurso de destino", dados?.destino, "Macaiba/RN");
conferir("valor da carga", dados?.valorCarga, 1360);
// O placeholder do template da SEFAZ nao pode chegar a tela.
conferir("motivo sem placeholder", cte?.status_documento, "Autorizado o uso do CTe");

console.log("\nCT-e com o cliente como tomador");
const comTomador = await parseRetDistDFeInt(
  envelope(docZip(XML_CTE_TOMADOR, "000000000000329", "procCTe_v4.00.xsd"))
);
const cteTomador = await normalizarDocumentoCTe(comTomador.documentos[0], {
  cnpjCliente: CNPJ_CLIENTE,
});
const dadosTomador = cteTomador?.json_dados as Record<string, unknown>;

conferir("tomador e o destinatario", dadosTomador?.tomadorPapel, "Destinatario");
conferir("cliente paga o frete", dadosTomador?.clienteEhTomador, true);

console.log("\nevento de cancelamento");
const evento = await normalizarDocumentoCTe(lote.documentos[1], {
  cnpjCliente: CNPJ_CLIENTE,
});

conferir("tipo do documento", evento?.tipo_documento, "EventoCTe");
conferir("completude", evento?.completude, "evento");
conferir("aponta para o CT-e original", evento?.chave_acesso, CHAVE_CTE);
conferir("tipo do evento", (evento?.json_dados as Record<string, unknown>)?.tpEvento, "110111");
conferir("data do evento", evento?.data_emissao, "2026-05-06");

console.log("\nschema desconhecido e ignorado");
const outro = await normalizarDocumentoCTe(
  { nsu: "1", schema: "outro.xsd", xml: "<algo><x>1</x></algo>" },
  { cnpjCliente: CNPJ_CLIENTE }
);
conferir("devolve nulo", outro, null);

console.log("\na distribuicao da NF-e continua sendo lida como NF-e");
const nfe = await parseRetDistDFeInt(
  `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><nfeDistDFeInteresseResponse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDistDFeInteresseResult><retDistDFeInt versao="1.01" xmlns="http://www.portalfiscal.inf.br/nfe"><cStat>137</cStat><xMotivo>Nenhum documento localizado</xMotivo><ultNSU>000000000001394</ultNSU><maxNSU>000000000001394</maxNSU></retDistDFeInt></nfeDistDFeInteresseResult></nfeDistDFeInteresseResponse></soap:Body></soap:Envelope>`
);
conferir("cStat da NF-e", nfe.cStat, "137");
conferir("sem documentos", nfe.documentos.length, 0);

console.log(`\n${passou} passaram, ${falhou} falharam`);
process.exit(falhou === 0 ? 0 : 1);
