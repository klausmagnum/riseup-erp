/**
 * Verificação do pipeline de leitura da MDF-e.
 *
 * Monta o envelope no formato que o MDFeDistribuicaoDFe devolve e confere o que
 * sai do outro lado. Não usa rede nem certificado.
 *
 * O envelope da MDF-e é diferente do das outras famílias em dois pontos, e os
 * dois estão exercitados aqui: o corpo não tem elemento de operação embrulhando
 * o dadosMsg, e o serviço fica na SVRS, cujo WSDL só é servido a quem apresenta
 * certificado — por isso a leitura procura o retDistDFeInt pelo conteúdo.
 *
 * Os XMLs abaixo não vieram de um manifesto real: o único cliente com
 * certificado cadastrado não emite MDF-e, e a fila dele voltou vazia. Em troca,
 * eles foram validados contra os schemas oficiais do pacote PRMDF da SVRS
 * (procMDFe_v3.00.xsd, procEventoMDFe_v3.00.xsd e mdfeModalRodoviario_v3.00.xsd),
 * e passam inteiros — só falta a assinatura digital, que um exemplo não tem. É
 * o que garante que os caminhos lidos aqui são os do documento de verdade.
 *
 *   npx tsx scripts/verificar-mdfe.mts
 */
import { gzipSync } from "node:zlib";
import { parseRetDistDFeInt } from "../app/lib/sefaz/distribuicaoDFe.ts";
import { normalizarDocumentoMDFe } from "../app/lib/sefaz/parseMDFe.ts";

const CNPJ_TRANSPORTADORA = "12345678000195";
const CNPJ_CONTRATANTE = "49039801000150";
const CHAVE_MDFE = "35260612345678000195580010000001231000001238";

/** MDF-e rodoviária: o transportador emite, e o cliente é o contratante. */
const XML_MDFE = `<?xml version="1.0" encoding="UTF-8"?><mdfeProc versao="3.00" xmlns="http://www.portalfiscal.inf.br/mdfe"><MDFe xmlns="http://www.portalfiscal.inf.br/mdfe"><infMDFe Id="MDFe${CHAVE_MDFE}" versao="3.00"><ide><cUF>35</cUF><tpAmb>1</tpAmb><tpEmit>1</tpEmit><mod>58</mod><serie>1</serie><nMDF>123</nMDF><cMDF>00000123</cMDF><cDV>8</cDV><modal>1</modal><dhEmi>2026-06-15T08:30:00-03:00</dhEmi><tpEmis>1</tpEmis><procEmi>0</procEmi><verProc>1.0</verProc><UFIni>SP</UFIni><UFFim>RN</UFFim><infMunCarrega><cMunCarrega>3513009</cMunCarrega><xMunCarrega>Cotia</xMunCarrega></infMunCarrega><infPercurso><UFPer>MG</UFPer></infPercurso><infPercurso><UFPer>BA</UFPer></infPercurso><dhIniViagem>2026-06-15T10:00:00-03:00</dhIniViagem></ide><emit><CNPJ>${CNPJ_TRANSPORTADORA}</CNPJ><IE>111222333444</IE><xNome>TRANSPORTADORA MODELO LTDA</xNome><enderEmit><xLgr>Rua das Cargas</xLgr><nro>500</nro><xBairro>Centro</xBairro><cMun>3505708</cMun><xMun>Barueri</xMun><CEP>06400000</CEP><UF>SP</UF></enderEmit></emit><infModal versaoModal="3.00"><rodo><infANTT><RNTRC>12345678</RNTRC><infContratante><CNPJ>${CNPJ_CONTRATANTE}</CNPJ></infContratante></infANTT><veicTracao><cInt>1</cInt><placa>ABC1D23</placa><tara>8000</tara><condutor><xNome>Jose da Silva</xNome><CPF>12345678909</CPF></condutor><condutor><xNome>Maria Souza</xNome><CPF>98765432100</CPF></condutor><tpRod>06</tpRod><tpCar>02</tpCar><UF>SP</UF></veicTracao></rodo></infModal><infDoc><infMunDescarga><cMunDescarga>2407104</cMunDescarga><xMunDescarga>Macaiba</xMunDescarga><infNFe><chNFe>35260534660006000107550010000112341000112348</chNFe></infNFe><infNFe><chNFe>35260534660006000107550010000112351000112355</chNFe></infNFe></infMunDescarga><infMunDescarga><cMunDescarga>2408102</cMunDescarga><xMunDescarga>Natal</xMunDescarga><infCTe><chCTe>35260503007331007235570011310599701373343595</chCTe></infCTe></infMunDescarga></infDoc><tot><qCTe>1</qCTe><qNFe>2</qNFe><vCarga>18500.00</vCarga><cUnid>01</cUnid><qCarga>1250.0000</qCarga></tot></infMDFe></MDFe><protMDFe versao="3.00"><infProt><tpAmb>1</tpAmb><verAplic>SVRS_MDFE</verAplic><chMDFe>${CHAVE_MDFE}</chMDFe><dhRecbto>2026-06-15T08:30:45-03:00</dhRecbto><nProt>135260000000123</nProt><digVal>0HLFPUuBMs+8mMEEmvV8V0Odzsc=</digVal><cStat>100</cStat><xMotivo>Autorizado o uso do MDF-e</xMotivo></infProt></protMDFe></mdfeProc>`;

/** A mesma MDF-e emitida pelo próprio cliente, carga própria. */
const XML_MDFE_PROPRIA = XML_MDFE.replace(
  `<CNPJ>${CNPJ_TRANSPORTADORA}</CNPJ><IE>`,
  `<CNPJ>${CNPJ_CONTRATANTE}</CNPJ><IE>`
).replace(`<tpEmit>1</tpEmit>`, `<tpEmit>2</tpEmit>`);

/** Encerramento: é ele que fecha a viagem na SEFAZ. */
const XML_ENCERRAMENTO = `<?xml version="1.0" encoding="UTF-8"?><procEventoMDFe versao="3.00" xmlns="http://www.portalfiscal.inf.br/mdfe"><eventoMDFe versao="3.00"><infEvento Id="ID110112${CHAVE_MDFE}01"><cOrgao>35</cOrgao><tpAmb>1</tpAmb><CNPJ>${CNPJ_TRANSPORTADORA}</CNPJ><chMDFe>${CHAVE_MDFE}</chMDFe><dhEvento>2026-06-18T17:45:00-03:00</dhEvento><tpEvento>110112</tpEvento><nSeqEvento>1</nSeqEvento><detEvento versaoEvento="3.00"><evEncMDFe><descEvento>Encerramento</descEvento><nProt>135260000000123</nProt><dtEnc>2026-06-18</dtEnc><cUF>24</cUF><cMun>2407104</cMun></evEncMDFe></detEvento></infEvento></eventoMDFe><retEventoMDFe versao="3.00"><infEvento><tpAmb>1</tpAmb><verAplic>SVRS_MDFE</verAplic><cOrgao>35</cOrgao><cStat>135</cStat><xMotivo>Evento registrado e vinculado ao MDF-e</xMotivo><chMDFe>${CHAVE_MDFE}</chMDFe><tpEvento>110112</tpEvento><xEvento>Encerramento</xEvento><nSeqEvento>1</nSeqEvento><dhRegEvento>2026-06-18T17:45:30-03:00</dhRegEvento><nProt>135260000000456</nProt></infEvento></retEventoMDFe></procEventoMDFe>`;

function docZip(xml: string, nsu: string, schema: string) {
  const conteudo = gzipSync(Buffer.from(xml, "utf8")).toString("base64");
  return `<docZip NSU="${nsu}" schema="${schema}">${conteudo}</docZip>`;
}

/** Envelope da SVRS: sem elemento de operação embrulhando o resultado. */
function envelope(docs: string, cStat = "138", ultNSU = "000000000000045") {
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body>` +
    `<mdfeDistDFeInteresseResponse xmlns="http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeDistribuicaoDFe">` +
    `<mdfeDistDFeInteresseResult>` +
    `<retDistDFeInt versao="1.00" xmlns="http://www.portalfiscal.inf.br/mdfe">` +
    `<tpAmb>1</tpAmb><verAplic>1.0</verAplic><cStat>${cStat}</cStat>` +
    `<xMotivo>Documento localizado</xMotivo>` +
    `<dhResp>2026-08-02T15:00:00</dhResp>` +
    `<ultNSU>${ultNSU}</ultNSU><maxNSU>000000000000045</maxNSU>` +
    `<loteDistDFeInt>${docs}</loteDistDFeInt>` +
    `</retDistDFeInt></mdfeDistDFeInteresseResult></mdfeDistDFeInteresseResponse>` +
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

console.log("envelope do MDFeDistribuicaoDFe");

const lote = await parseRetDistDFeInt(
  envelope(
    docZip(XML_MDFE, "000000000000041", "procMDFe_v3.00.xsd") +
      docZip(XML_ENCERRAMENTO, "000000000000044", "procEventoMDFe_v3.00.xsd")
  )
);

conferir("cStat", lote.cStat, "138");
conferir("documentos no lote", lote.documentos.length, 2);
conferir("ultNSU", lote.ultNSU, "000000000000045");
conferir("maxNSU", lote.maxNSU, "000000000000045");
conferir("schema do primeiro", lote.documentos[0].schema, "procMDFe_v3.00.xsd");
conferir("XML descompactado", lote.documentos[0].xml.startsWith("<?xml"), true);

console.log("\nMDF-e emitida pela transportadora contratada");
const mdfe = await normalizarDocumentoMDFe(lote.documentos[0], {
  cnpjCliente: CNPJ_CONTRATANTE,
  nomeCliente: "GEOWELLEX",
});
const dados = mdfe?.json_dados as Record<string, unknown>;

conferir("tipo do documento", mdfe?.tipo_documento, "MDFe");
conferir("numero", mdfe?.numero, "123");
conferir("serie", mdfe?.serie, "1");
conferir("chave com 44 digitos", mdfe?.chave_acesso.length, 44);
conferir("modelo 58 na chave", mdfe?.chave_acesso.slice(20, 22), "58");
conferir("data de emissao", mdfe?.data_emissao, "2026-06-15");
// Manifesto não é documento de valor: a carga que ele leva já entra pelas NF-e.
conferir("sem valor proprio", mdfe?.valor_total, null);
conferir("emitente e a transportadora", mdfe?.emitente_cnpj_cpf, CNPJ_TRANSPORTADORA);
conferir("destinatario e o contratante", mdfe?.destinatario_cnpj_cpf, CNPJ_CONTRATANTE);
conferir("nome do contratante e o do cliente", mdfe?.destinatario_nome, "GEOWELLEX");
conferir("municipio do emitente", mdfe?.municipio, "Barueri");
conferir("UF do emitente", mdfe?.uf, "SP");
conferir("completude", mdfe?.completude, "completo");
conferir("situacao", mdfe?.status_documento, "Autorizado o uso do MDF-e");
conferir("modal", dados?.modal, "Rodoviario");
conferir("tipo do emitente", dados?.tipoEmitente, "Prestador de servico de transporte");
conferir("percurso com as UFs do meio", dados?.percurso, "SP > MG > BA > RN");
conferir("municipios de carregamento", dados?.municipiosCarregamento, ["Cotia"]);
conferir("municipios de descarga", dados?.municipiosDescarga, ["Macaiba", "Natal"]);
conferir("notas manifestadas", dados?.quantidadeNFe, 2);
conferir("CT-e manifestados", dados?.quantidadeCTe, 1);
conferir("valor da carga", dados?.valorCarga, 18500);
conferir("peso da carga", dados?.pesoCarga, 1250);
conferir("placa do veiculo", dados?.placaVeiculo, "ABC1D23");
conferir("condutores", dados?.condutores, ["Jose da Silva", "Maria Souza"]);
conferir("RNTRC", dados?.rntrc, "12345678");
conferir("contratantes", dados?.contratantes, [CNPJ_CONTRATANTE]);
conferir("cliente contratou o frete", dados?.clienteEhContratante, true);
conferir("inicio da viagem", dados?.dataInicioViagem, "2026-06-15");

console.log("\nMDF-e de carga propria, emitida pelo cliente");
const propria = await parseRetDistDFeInt(
  envelope(docZip(XML_MDFE_PROPRIA, "000000000000042", "procMDFe_v3.00.xsd"))
);
const doCliente = await normalizarDocumentoMDFe(propria.documentos[0], {
  cnpjCliente: CNPJ_CONTRATANTE,
  nomeCliente: "GEOWELLEX",
});

// Emitente igual ao CNPJ do cliente e o que faz o painel classificar como saida.
conferir("emitente e o proprio cliente", doCliente?.emitente_cnpj_cpf, CNPJ_CONTRATANTE);
conferir(
  "tipo do emitente",
  (doCliente?.json_dados as Record<string, unknown>)?.tipoEmitente,
  "Transportador de carga propria"
);

console.log("\nevento de encerramento");
const evento = await normalizarDocumentoMDFe(lote.documentos[1], {
  cnpjCliente: CNPJ_CONTRATANTE,
});
const dadosEvento = evento?.json_dados as Record<string, unknown>;

conferir("tipo do documento", evento?.tipo_documento, "EventoMDFe");
conferir("completude", evento?.completude, "evento");
conferir("aponta para o manifesto", evento?.chave_acesso, CHAVE_MDFE);
conferir("descricao do evento", evento?.status_documento, "Encerramento");
conferir("tipo do evento", dadosEvento?.tpEvento, "110112");
conferir("sequencia do evento", dadosEvento?.nSeqEvento, "1");
conferir("data do evento", evento?.data_emissao, "2026-06-18");
// A viagem fecha na data declarada, que pode ser anterior ao registro.
conferir("data de encerramento", dadosEvento?.dataEncerramento, "2026-06-18");
conferir("UF de encerramento", dadosEvento?.ufEncerramento, "24");

console.log("\nschema desconhecido e ignorado");
const outro = await normalizarDocumentoMDFe(
  { nsu: "1", schema: "outro.xsd", xml: "<algo><x>1</x></algo>" },
  { cnpjCliente: CNPJ_CONTRATANTE }
);
conferir("devolve nulo", outro, null);

console.log("\nfila vazia");
const vazio = await parseRetDistDFeInt(
  `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><mdfeDistDFeInteresseResponse xmlns="http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeDistribuicaoDFe"><mdfeDistDFeInteresseResult><retDistDFeInt versao="1.00" xmlns="http://www.portalfiscal.inf.br/mdfe"><cStat>137</cStat><xMotivo>Nenhum documento localizado</xMotivo><ultNSU>000000000000045</ultNSU><maxNSU>000000000000045</maxNSU></retDistDFeInt></mdfeDistDFeInteresseResult></mdfeDistDFeInteresseResponse></soap:Body></soap:Envelope>`
);
conferir("cStat", vazio.cStat, "137");
conferir("sem documentos", vazio.documentos.length, 0);

console.log("\na distribuicao da NF-e continua sendo lida como NF-e");
const nfe = await parseRetDistDFeInt(
  `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><nfeDistDFeInteresseResponse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDistDFeInteresseResult><retDistDFeInt versao="1.01" xmlns="http://www.portalfiscal.inf.br/nfe"><cStat>137</cStat><xMotivo>Nenhum documento localizado</xMotivo><ultNSU>000000000001394</ultNSU><maxNSU>000000000001394</maxNSU></retDistDFeInt></nfeDistDFeInteresseResult></nfeDistDFeInteresseResponse></soap:Body></soap:Envelope>`
);
conferir("cStat da NF-e", nfe.cStat, "137");
conferir("ultNSU da NF-e", nfe.ultNSU, "000000000001394");

console.log(`\n${passou} passaram, ${falhou} falharam`);
process.exit(falhou === 0 ? 0 : 1);
