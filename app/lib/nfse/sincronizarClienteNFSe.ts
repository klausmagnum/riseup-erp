import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buscarLoteADN,
  JANELA_BLOQUEIO_MS,
  type AmbienteADN,
  type DocumentoADN,
} from "./distribuicaoADN";
import { normalizarDocumentoNFSe } from "./parseNFSe";
import { carregarCertificado, type RegistroCertificado } from "../sefaz/certificado";
import { ensureDocumentoFolder, uploadTextFile } from "../googleDriveServer";

/**
 * Captura das NFS-e de um cliente pelo Ambiente de Dados Nacional.
 *
 * Espelha o fluxo da NF-e: pagina por NSU, grava cada documento, arquiva o XML
 * no Drive e carimba o NSU alcançado para retomar de onde parou. O que muda é
 * a fonte — REST/JSON no ADN em vez de SOAP na SEFAZ — e o fato de a NFS-e
 * chegar sempre completa, sem o estágio de resumo.
 */

/** Identifica o fluxo de origem. É o que separa o NSU do ADN do NSU da SEFAZ
 *  no índice de deduplicação. */
export const ORIGEM_ADN = "ADN/NFSeNacional";

/**
 * Tempo reservado para processar um lote inteiro antes de pedir o próximo.
 *
 * Mesmo raciocínio da NF-e, em sincronizarCliente.ts: pedir um lote que não
 * caiba no tempo restante é pior do que parar. O ADN marca a faixa de NSU como
 * entregue, e o que sobrar teria de ser pedido de novo na execução seguinte —
 * consumo repetido é o que ele recusa com HTTP 429. A fila do ADN nunca
 * acumulou até hoje porque só há um cliente; o cenário que morde é a primeira
 * sincronização de cada cliente novo, que começa com meses de atraso.
 */
const RESERVA_POR_LOTE_MS = 60_000;

/**
 * Documentos gravados ao mesmo tempo dentro de um lote. É o que faz o lote de
 * 50 caber no orçamento: cada documento custa idas ao Supabase e ao Drive, e em
 * série o lote passava de dois minutos.
 */
const CONCORRENCIA_GRAVACAO = 6;

export interface ClienteSincronizavelNFSe {
  id: string;
  razao_social: string;
  identificacao: string | null;
  ultimo_nsu_nfse_recebida: number | null;
}

export interface ResultadoSincronizacaoNFSe {
  clienteId: string;
  cliente: string;
  status: "Sucesso" | "Erro" | "Sem novidades" | "Interrompido";
  encontrados: number;
  importados: number;
  erros: number;
  ultimoNsu: string;
  mensagem: string;
  bloqueadoAte?: Date;
}

export async function sincronizarClienteNFSe(params: {
  supabase: SupabaseClient;
  cliente: ClienteSincronizavelNFSe;
  certificado: RegistroCertificado;
  ambiente?: AmbienteADN;
  deadline: number;
  maxLotes?: number;
}): Promise<ResultadoSincronizacaoNFSe> {
  const { supabase, cliente } = params;
  const ambiente = params.ambiente ?? "producao";
  const maxLotes = params.maxLotes ?? 20;

  const base: ResultadoSincronizacaoNFSe = {
    clienteId: cliente.id,
    cliente: cliente.razao_social,
    status: "Erro",
    encontrados: 0,
    importados: 0,
    erros: 0,
    ultimoNsu: String(cliente.ultimo_nsu_nfse_recebida ?? 0),
    mensagem: "",
  };

  const cnpj = (cliente.identificacao ?? "").replace(/\D/g, "");
  if (cnpj.length !== 14) {
    const mensagem = "Cliente sem CNPJ valido (o ADN nao atende CPF).";
    await registrarEstado(supabase, cliente.id, base.ultimoNsu, "Erro", mensagem, false);
    return { ...base, mensagem };
  }

  let credenciais;
  try {
    credenciais = await carregarCertificado(params.certificado);
  } catch (error) {
    const mensagem =
      error instanceof Error ? error.message : "Falha ao carregar certificado.";

    // Carimbar mesmo em falha: a fila é ordenada pela última sincronização com
    // nulos primeiro, e sem o carimbo o cliente quebrado voltaria ao topo em
    // toda execução, consumindo o orçamento dos demais.
    await registrarEstado(supabase, cliente.id, base.ultimoNsu, "Erro", mensagem, false);
    return { ...base, mensagem };
  }

  let ultNSU = String(cliente.ultimo_nsu_nfse_recebida ?? 0);
  let encontrados = 0;
  let importados = 0;
  let erros = 0;
  let lotes = 0;
  let interrompido = false;

  try {
    while (lotes < maxLotes) {
      // A folga é para o lote inteiro, não para a chamada: um lote abandonado
      // pela metade vira repedido na execução seguinte, e repedido vira 429.
      if (Date.now() + RESERVA_POR_LOTE_MS > params.deadline) {
        interrompido = true;
        break;
      }

      const lote = await buscarLoteADN({ ultNSU, certificado: credenciais, ambiente });
      lotes += 1;

      if (lote.bloqueado) {
        // Mesmo raciocínio do 656 da SEFAZ: recusa por excesso de consultas é
        // intervalo pedido, não falha, e não deve pintar o cliente de vermelho.
        await registrarEstado(supabase, cliente.id, ultNSU, "Bloqueado", lote.mensagem, true);
        return {
          ...base,
          status: "Erro",
          encontrados,
          importados,
          erros,
          ultimoNsu: ultNSU,
          mensagem: lote.mensagem,
          bloqueadoAte: new Date(Date.now() + JANELA_BLOQUEIO_MS),
        };
      }

      // Lote vazio é o fim da fila.
      if (lote.documentos.length === 0) break;

      encontrados += lote.documentos.length;

      // O lote é sempre processado inteiro, e o NSU acompanha o que o ADN
      // entregou — e não o último documento gravado. Diferente da SEFAZ, o
      // ultNSU do ADN não vem declarado na resposta: é o maior NSU do lote,
      // calculado em parseEnvelopeADN. Só avança depois do lote inteiro para
      // que uma interrupção nunca deixe a faixa pela metade.
      const gravacao = await gravarLote(supabase, cliente, lote.documentos, cnpj);
      importados += gravacao.importados;
      erros += gravacao.erros;

      // Sem avanço, o laço repetiria o mesmo trecho da fila para sempre.
      if (Number(lote.ultNSU) <= Number(ultNSU)) break;
      ultNSU = lote.ultNSU;
    }
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido";
    await registrarEstado(supabase, cliente.id, ultNSU, "Erro", mensagem, false);
    return { ...base, encontrados, importados, erros, ultimoNsu: ultNSU, mensagem };
  }

  const status: ResultadoSincronizacaoNFSe["status"] = interrompido
    ? "Interrompido"
    : encontrados === 0
      ? "Sem novidades"
      : "Sucesso";

  const mensagem = interrompido
    ? `Parcial: ${importados} importados, retomar do NSU ${ultNSU}.`
    : encontrados === 0
      ? "Nenhum documento novo."
      : `${importados} de ${encontrados} documentos importados.`;

  await registrarEstado(supabase, cliente.id, ultNSU, status, mensagem, false);

  return { ...base, status, encontrados, importados, erros, ultimoNsu: ultNSU, mensagem };
}

/**
 * Grava os documentos de um lote, alguns ao mesmo tempo. Ver gravarLote em
 * sincronizarCliente.ts: é o que permite processar o lote inteiro dentro do
 * orçamento em vez de abandoná-lo no meio.
 */
async function gravarLote(
  supabase: SupabaseClient,
  cliente: ClienteSincronizavelNFSe,
  documentos: DocumentoADN[],
  cnpjCliente: string
): Promise<{ importados: number; erros: number }> {
  let importados = 0;
  let erros = 0;

  const fila = [...documentos];

  async function trabalhador() {
    for (let doc = fila.shift(); doc; doc = fila.shift()) {
      try {
        if (await gravarDocumento(supabase, cliente, doc, cnpjCliente)) importados += 1;
      } catch (error) {
        erros += 1;
        console.error(
          `[adn] cliente=${cliente.id} nsu=${doc.nsu} falhou:`,
          error instanceof Error ? error.message : error
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCORRENCIA_GRAVACAO, fila.length) }, trabalhador)
  );

  return { importados, erros };
}

/** Nome do arquivo no Drive. A chave da NFS-e identifica a nota; o evento
 *  repete a chave da nota a que se refere e é individualizado pelo NSU. */
function arquivoDoDocumento(doc: {
  chave: string;
  nsu: string;
  completude: "resumo" | "completo" | "evento";
}) {
  const base = doc.chave || `NFSe-nsu${doc.nsu}`;
  return doc.completude === "evento" ? `${base}-evento-nsu${doc.nsu}.xml` : `${base}.xml`;
}

/** Grava o documento e arquiva o XML. Devolve false se já existia. */
async function gravarDocumento(
  supabase: SupabaseClient,
  cliente: ClienteSincronizavelNFSe,
  doc: DocumentoADN,
  cnpjCliente: string
): Promise<boolean> {
  const normalizado = await normalizarDocumentoNFSe(doc, {
    cnpjCliente,
    nomeCliente: cliente.razao_social,
  });

  if (!normalizado) return false;

  // A deduplicação é por (cliente, origem, nsu): o NSU do ADN é uma sequência
  // independente da SEFAZ e os dois podem coincidir no mesmo cliente.
  const jaExiste = await supabase
    .from("documentos_fiscais")
    .select("id")
    .eq("cliente_id", cliente.id)
    .eq("origem", ORIGEM_ADN)
    .eq("nsu", doc.nsu)
    .maybeSingle();

  if (jaExiste.data) return false;

  const referencia = normalizado.data_emissao ?? new Date().toISOString().slice(0, 10);
  const [ano, mes] = referencia.split("-");

  let driveFileId: string | null = null;
  let xmlPath: string | null = null;

  try {
    const pasta = await ensureDocumentoFolder({
      nomeCliente: cliente.razao_social,
      tipoDocumento: normalizado.tipo_documento,
      ano,
      mes,
    });

    const upload = await uploadTextFile({
      nome: arquivoDoDocumento({
        chave: normalizado.chave_acesso,
        nsu: doc.nsu,
        completude: normalizado.completude,
      }),
      conteudo: doc.xml,
      parentFolderId: pasta,
    });

    driveFileId = upload.id;
    xmlPath = upload.webViewLink;
  } catch (error) {
    // O arquivamento falhar não pode fazer perder o registro fiscal.
    console.error(
      `[drive] falha ao arquivar nsu=${doc.nsu} do cliente ${cliente.id}:`,
      error instanceof Error ? error.message : error
    );
  }

  const { data: inserido, error } = await supabase
    .from("documentos_fiscais")
    .insert({
      cliente_id: cliente.id,
      tipo_documento: normalizado.tipo_documento,
      numero: normalizado.numero,
      serie: normalizado.serie,
      chave_acesso: normalizado.chave_acesso,
      data_emissao: normalizado.data_emissao,
      valor_total: normalizado.valor_total,
      emitente_cnpj_cpf: normalizado.emitente_cnpj_cpf,
      emitente_nome: normalizado.emitente_nome,
      destinatario_cnpj_cpf: normalizado.destinatario_cnpj_cpf,
      destinatario_nome: normalizado.destinatario_nome,
      municipio: normalizado.municipio,
      uf: normalizado.uf,
      status_documento: normalizado.status_documento,
      origem: ORIGEM_ADN,
      nsu: doc.nsu,
      completude: normalizado.completude,
      drive_file_id: driveFileId,
      xml_storage_path: xmlPath,
      json_dados: normalizado.json_dados,
      possui_pendencia: !driveFileId,
      status_processamento: "Importado",
    })
    .select("id")
    .single();

  if (error) {
    // Corrida entre execuções simultâneas: o índice único resolveu.
    if (error.code === "23505") return false;
    throw new Error(`Falha ao gravar NFS-e NSU ${doc.nsu}: ${error.message}`);
  }

  if (!driveFileId && inserido) {
    await supabase.from("documentos_fiscais_pendencias").insert({
      documento_fiscal_id: inserido.id,
      cliente_id: cliente.id,
      tipo_pendencia: "ARQUIVAMENTO",
      descricao: "XML da NFS-e nao foi arquivado no Google Drive; reprocessar.",
    });
  }

  // Um evento de cancelamento deixa a nota original sem valor fiscal. Sem
  // refletir isso, ela seguiria contada como nota válida nos quadros.
  if (
    normalizado.completude === "evento" &&
    normalizado.chave_acesso &&
    /cancelamento/i.test(normalizado.status_documento)
  ) {
    await supabase
      .from("documentos_fiscais")
      .update({ status_documento: "Cancelada" })
      .eq("cliente_id", cliente.id)
      .eq("chave_acesso", normalizado.chave_acesso)
      .eq("tipo_documento", "NFSe");
  }

  return true;
}

async function registrarEstado(
  supabase: SupabaseClient,
  clienteId: string,
  ultimoNsu: string,
  status: string,
  mensagem: string,
  aplicarJanela: boolean
) {
  const patch: Record<string, unknown> = {
    ultimo_nsu_nfse_recebida: Number(ultimoNsu) || 0,
    ultima_sincronizacao_nfse: new Date().toISOString(),
    ultima_sincronizacao_nfse_status: status,
    mensagem_ultima_sincronizacao_nfse: mensagem.slice(0, 500),
  };

  if (aplicarJanela) {
    patch.proxima_sincronizacao_nfse = new Date(Date.now() + JANELA_BLOQUEIO_MS).toISOString();
  }

  await supabase.from("clientes").update(patch).eq("id", clienteId);
}
