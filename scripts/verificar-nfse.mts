/**
 * Verificação do pipeline de leitura da NFS-e do ambiente nacional.
 *
 * Monta a resposta no formato exato que o ADN devolve — envelope JSON com o
 * ArquivoXml em base64 de gzip — a partir de XML capturado do ambiente real, e
 * confere o que sai do outro lado. Não usa rede nem certificado.
 *
 *   npx tsx scripts/verificar-nfse.mts
 */
import { gzipSync } from "node:zlib";
import { interpretarRespostaADN, parseEnvelopeADN } from "../app/lib/nfse/distribuicaoADN.ts";
import { normalizarDocumentoNFSe } from "../app/lib/nfse/parseNFSe.ts";

const CNPJ_CLIENTE = "49039801000150";
const CHAVE_NFSE = "24032512252131846000164000000000001024024696597355";
const CHAVE_EVENTO = "24032512252131846000164000000000004525109571056760";

/** NFS-e tomada: o prestador é outro, o tomador é o cliente. */
const XML_NFSE = `<?xml version="1.0" encoding="utf-8"?><NFSe versao="1.00" xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS${CHAVE_NFSE}"><xLocEmi>Parnamirim</xLocEmi><xLocPrestacao>Macaíba</xLocPrestacao><nNFSe>10</nNFSe><cLocIncid>2403251</cLocIncid><xLocIncid>Parnamirim</xLocIncid><verAplic>EmissorWeb_1.1.0.1</verAplic><ambGer>2</ambGer><tpEmis>1</tpEmis><cStat>107</cStat><dhProc>2024-02-28T18:56:22-03:00</dhProc><nDFSe>35677</nDFSe><emit><CNPJ>52131846000164</CNPJ><xNome>52.131.846 MARIA NEIDE VERAS MEDEIROS</xNome><enderNac><xLgr>FRANCISCO FERREIRA NEVES</xLgr><nro>139</nro><xBairro>MONTE CASTELO</xBairro><cMun>2403251</cMun><UF>RN</UF><CEP>59146180</CEP></enderNac></emit><valores><vTotalRet>0.00</vTotalRet><vLiq>1000.00</vLiq></valores><DPS versao="1.00" xmlns="http://www.sped.fazenda.gov.br/nfse"><infDPS Id="DPS240325125213184600016400900000000000000039"><tpAmb>1</tpAmb><dhEmi>2024-02-28T18:56:22-03:00</dhEmi><serie>900</serie><nDPS>39</nDPS><dCompet>2024-02-28</dCompet><tpEmit>1</tpEmit><cLocEmi>2403251</cLocEmi><prest><CNPJ>52131846000164</CNPJ></prest><toma><CNPJ>${CNPJ_CLIENTE}</CNPJ><xNome>GEOWELLEX PESQUISA, DESENVOLVIMENTO E INOVACAO LTDA</xNome></toma><serv><cServ><cTribNac>140601</cTribNac><xDescServ>ADEQUAÇÃO DE TANQUE, COM SERVIÇO CORTE, SOLDA E MONTAGEM.</xDescServ></cServ></serv><valores><vServPrest><vServ>1000.00</vServ></vServPrest></valores></infDPS></DPS></infNFSe></NFSe>`;

/** NFS-e prestada: o próprio cliente é o prestador. */
const XML_NFSE_PRESTADA = XML_NFSE.replace(
  `<prest><CNPJ>52131846000164</CNPJ></prest>`,
  `<prest><CNPJ>${CNPJ_CLIENTE}</CNPJ></prest>`
);

const XML_EVENTO = `<?xml version="1.0" encoding="utf-8"?><evento versao="1.00" xmlns="http://www.sped.fazenda.gov.br/nfse"><infEvento Id="EVT${CHAVE_EVENTO}105102001"><verAplic>EmissorWeb_1.4.0.0</verAplic><ambGer>2</ambGer><nSeqEvento>0</nSeqEvento><dhProc>2025-10-13T22:00:10-03:00</dhProc><nDFe>0</nDFe><pedRegEvento versao="1.00" xmlns="http://www.sped.fazenda.gov.br/nfse"><infPedReg Id="PRE105102"><tpAmb>1</tpAmb><dhEvento>2025-10-13T22:00:10-03:00</dhEvento><CNPJAutor>52131846000164</CNPJAutor><chNFSe>${CHAVE_EVENTO}</chNFSe><nPedRegEvento>0</nPedRegEvento><e105102><xDesc>Cancelamento de NFS-e por Substituicao</xDesc><cMotivo>99</cMotivo><xMotivo>Erro na descrição do serviço.</xMotivo><chSubstituta>24032512252131846000164000000000004625101705398138</chSubstituta></e105102></infPedReg></pedRegEvento></infEvento></evento>`;

function empacotar(xml: string) {
  return gzipSync(Buffer.from(xml, "utf8")).toString("base64");
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

console.log("envelope do ADN");

const envelope = JSON.stringify({
  StatusProcessamento: "DOCUMENTOS_LOCALIZADOS",
  LoteDFe: [
    {
      NSU: 1,
      ChaveAcesso: CHAVE_NFSE,
      TipoDocumento: "NFSE",
      ArquivoXml: empacotar(XML_NFSE),
      DataHoraGeracao: "2024-02-28T18:56:22-03:00",
    },
    {
      NSU: 19,
      ChaveAcesso: CHAVE_EVENTO,
      TipoDocumento: "EVENTO",
      ArquivoXml: empacotar(XML_EVENTO),
      DataHoraGeracao: "2025-10-13T22:00:10-03:00",
    },
  ],
  Erros: [],
  Alertas: [],
  TipoAmbiente: "PRODUCAO",
});

const lote = parseEnvelopeADN(envelope);

conferir("status do processamento", lote.status, "DOCUMENTOS_LOCALIZADOS");
conferir("documentos no lote", lote.documentos.length, 2);
conferir("maior NSU do lote", lote.ultNSU, "19");
conferir("nao veio bloqueado", lote.bloqueado, false);
conferir("XML descompactado", lote.documentos[0].xml.startsWith("<?xml"), true);
conferir("tipo do segundo documento", lote.documentos[1].tipo, "EVENTO");

console.log("\nlote vazio encerra a fila");
const vazio = parseEnvelopeADN(
  JSON.stringify({ StatusProcessamento: "NENHUM_DOCUMENTO_LOCALIZADO", LoteDFe: [] })
);
conferir("nenhum documento", vazio.documentos.length, 0);
conferir("NSU permanece zerado", vazio.ultNSU, "0");

// Resposta real do ADN ao chegar no fim da fila da Geowellex, em 01/08/2026.
console.log("\nfim da fila vem como HTTP 404, e nao e falha");
const FIM_DA_FILA = JSON.stringify({
  StatusProcessamento: "NENHUM_DOCUMENTO_LOCALIZADO",
  LoteDFe: [],
  Alertas: [],
  Erros: [
    {
      Mensagem: {},
      Codigo: "E2220",
      Descricao:
        "Nenhum documento localizado - não existem documentos fiscais para o Contribuinte a partir do NSU informado.",
    },
  ],
  TipoAmbiente: "PRODUCAO",
});

const fim = interpretarRespostaADN(404, FIM_DA_FILA);
conferir("nao lanca erro", fim.status, "NENHUM_DOCUMENTO_LOCALIZADO");
conferir("lote vazio encerra o laco", fim.documentos.length, 0);
conferir("nao marca bloqueio", fim.bloqueado, false);
conferir("sem mensagem de erro", fim.mensagem, "");

console.log("\nHTTP 429 vira bloqueio, e nao excecao");
const excedido = interpretarRespostaADN(429, "<html><body>429</body></html>");
conferir("marca bloqueado", excedido.bloqueado, true);
conferir("status proprio", excedido.status, "CONSUMO_EXCEDIDO");

console.log("\n404 fora do padrao do ADN continua sendo falha");
let lancou = false;
try {
  interpretarRespostaADN(404, "<html>Not Found</html>");
} catch {
  lancou = true;
}
conferir("lanca excecao", lancou, true);

console.log("\nlote com documentos passa pelo interpretador");
const viaInterpretador = interpretarRespostaADN(200, envelope);
conferir("documentos preservados", viaInterpretador.documentos.length, 2);

console.log("\nNFS-e tomada (o cliente e o tomador)");
const tomada = await normalizarDocumentoNFSe(lote.documentos[0], {
  cnpjCliente: CNPJ_CLIENTE,
  nomeCliente: "GEOWELLEX",
});

conferir("tipo do documento", tomada?.tipo_documento, "NFSe");
conferir("numero da nota", tomada?.numero, "10");
conferir("serie", tomada?.serie, "900");
conferir("chave com 50 digitos", tomada?.chave_acesso.length, 50);
conferir("data de emissao", tomada?.data_emissao, "2024-02-28");
conferir("valor do servico", tomada?.valor_total, 1000);
// A direção sai daqui: emitente diferente do cliente significa nota tomada.
conferir("emitente e o prestador", tomada?.emitente_cnpj_cpf, "52131846000164");
conferir("tomador e o cliente", tomada?.destinatario_cnpj_cpf, CNPJ_CLIENTE);
conferir("municipio da prestacao", tomada?.municipio, "Macaíba");
conferir("UF do emitente", tomada?.uf, "RN");
conferir("situacao", tomada?.status_documento, "Autorizada");
conferir("completude", tomada?.completude, "completo");

console.log("\nNFS-e prestada (o cliente e o prestador)");
const prestadaLote = parseEnvelopeADN(
  JSON.stringify({
    StatusProcessamento: "DOCUMENTOS_LOCALIZADOS",
    LoteDFe: [
      {
        NSU: 2,
        ChaveAcesso: CHAVE_NFSE,
        TipoDocumento: "NFSE",
        ArquivoXml: empacotar(XML_NFSE_PRESTADA),
      },
    ],
  })
);
const prestada = await normalizarDocumentoNFSe(prestadaLote.documentos[0], {
  cnpjCliente: CNPJ_CLIENTE,
});
// Igual ao cliente, a visão do painel classifica como saída.
conferir("emitente e o proprio cliente", prestada?.emitente_cnpj_cpf, CNPJ_CLIENTE);

console.log("\nevento de cancelamento");
const evento = await normalizarDocumentoNFSe(lote.documentos[1], {
  cnpjCliente: CNPJ_CLIENTE,
});

conferir("tipo do documento", evento?.tipo_documento, "EventoNFSe");
conferir("completude", evento?.completude, "evento");
conferir("aponta para a nota original", evento?.chave_acesso, CHAVE_EVENTO);
conferir("descricao do evento", evento?.status_documento, "Cancelamento de NFS-e por Substituicao");
conferir("autor do evento", evento?.emitente_cnpj_cpf, "52131846000164");
conferir(
  "chave da substituta",
  (evento?.json_dados as Record<string, unknown>)?.chaveSubstituta,
  "24032512252131846000164000000000004625101705398138"
);
conferir("data do evento", evento?.data_emissao, "2025-10-13");

console.log("\nschema desconhecido e ignorado");
const outro = await normalizarDocumentoNFSe(
  { nsu: "99", tipo: "OUTRO", chaveAcesso: "", xml: "<algo><x>1</x></algo>", dataHoraGeracao: null },
  { cnpjCliente: CNPJ_CLIENTE }
);
conferir("devolve nulo", outro, null);

console.log(`\n${passou} passaram, ${falhou} falharam`);
process.exit(falhou === 0 ? 0 : 1);
