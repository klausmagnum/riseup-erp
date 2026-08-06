import type { SupabaseClient } from "@supabase/supabase-js";
import type { DocumentoNormalizado } from "./parseDocumento";
import { ensureDocumentoFolder, uploadTextFile } from "../googleDriveServer";

/**
 * Gravação de um documento capturado: arquiva o XML no Drive, insere a linha
 * em documentos_fiscais e abre as pendências que o caso exigir.
 *
 * É o trecho comum das três capturas — a fila da NF-e, a fila do CT-e e a
 * consulta por chave. Estava duplicado entre as duas primeiras, e a consulta
 * por chave seria a terceira cópia. O que muda entre elas cabe em parâmetro:
 * a origem, o NSU (que a consulta por chave não tem) e a manifestação do
 * destinatário, que só existe na NF-e.
 */

export interface ClienteDestino {
  id: string;
  razao_social: string;
}

export interface EntradaGravacao {
  supabase: SupabaseClient;
  cliente: ClienteDestino;
  documento: DocumentoNormalizado;
  /** XML integral, como veio da origem, para arquivar no Drive. */
  xml: string;
  /** Separa as filas na deduplicação: cada origem tem sua sequência de NSU. */
  origem: string;
  /** NSU da distribuição. Nulo na consulta por chave, que não passa por fila. */
  nsu: string | null;
  /** Só a NF-e tem manifestação do destinatário; o CT-e não. */
  registrarPendenciaDeManifestacao?: boolean;
}

/**
 * Nome do arquivo no Drive.
 *
 * A chave de acesso sozinha não serve: a mesma nota chega primeiro como resumo
 * e depois como XML completo, e os eventos (cancelamento, carta de correção)
 * repetem a chave da nota original. Como o Drive aceita nomes repetidos na
 * mesma pasta, isso produzia arquivos visualmente idênticos e indistinguíveis.
 *
 *   34...44.xml                  nota completa, a que vale para escrituração
 *   34...44-resumo.xml           só o resumo, enquanto não houver manifestação
 *   34...44-evento-nsu123.xml    cada evento, individualizado
 */
function arquivoDoDocumento(entrada: EntradaGravacao) {
  const { documento, nsu } = entrada;
  const base = documento.chave_acesso || `${documento.tipo_documento}-${nsu ?? "sem-nsu"}`;

  if (documento.completude === "completo") return `${base}.xml`;
  if (documento.completude === "resumo") return `${base}-resumo.xml`;

  // Sem NSU — caso da consulta por chave — o tipo do evento é o que distingue
  // um cancelamento de uma carta de correção da mesma nota.
  const sufixo = nsu ? `nsu${nsu}` : String(documento.json_dados.tpEvento ?? "sem-tipo");
  return `${base}-evento-${sufixo}.xml`;
}

/**
 * Diz se o documento já está gravado.
 *
 * A comparação é pela chave de acesso, e não pelo NSU, porque a mesma nota
 * pode chegar pelos dois caminhos: pela fila da origem, com um NSU, e depois
 * por uma consulta por chave. São entradas diferentes do mesmo documento, e
 * gravar as duas faria a nota aparecer em dobro na contagem do painel.
 */
async function jaGravado(entrada: EntradaGravacao): Promise<boolean> {
  const { supabase, cliente, documento, nsu, origem } = entrada;

  // Sem chave não há o que comparar; resta o número da entrada na fila.
  if (!documento.chave_acesso) {
    if (!nsu) return false;

    const { data } = await supabase
      .from("documentos_fiscais")
      .select("id")
      .eq("cliente_id", cliente.id)
      .eq("origem", origem)
      .eq("nsu", nsu)
      .maybeSingle();

    return Boolean(data);
  }

  const { data: existentes } = await supabase
    .from("documentos_fiscais")
    .select("id,nsu,json_dados")
    .eq("cliente_id", cliente.id)
    .eq("chave_acesso", documento.chave_acesso)
    .eq("completude", documento.completude)
    .returns<Array<{ id: string; nsu: string | null; json_dados: Record<string, unknown> | null }>>();

  if (!existentes?.length) return false;

  // Resumo e XML completo da mesma nota são registros distintos e desejados —
  // a completude já os separou. Chegando aqui, é a mesma coisa de novo.
  if (documento.completude !== "evento") return true;

  // Eventos são vários por nota, todos com a chave dela. O mesmo evento é o
  // mesmo tipo na mesma sequência: duas cartas de correção têm tipo igual e
  // sequências 1 e 2, e são documentos diferentes. Para o que foi gravado
  // antes de a sequência passar a ser guardada, sobra o NSU.
  const tipo = String(documento.json_dados.tpEvento ?? "");
  const sequencia = String(documento.json_dados.nSeqEvento ?? "");

  return existentes.some((linha) => {
    if (nsu && linha.nsu === nsu) return true;
    if (!sequencia) return false;

    const dados = linha.json_dados ?? {};
    return String(dados.tpEvento ?? "") === tipo && String(dados.nSeqEvento ?? "") === sequencia;
  });
}

/** Grava o documento e arquiva o XML. Devolve false se já existia. */
export async function gravarDocumentoCapturado(entrada: EntradaGravacao): Promise<boolean> {
  const { supabase, cliente, documento, nsu, origem } = entrada;

  if (await jaGravado(entrada)) return false;

  const referencia = documento.data_emissao ?? new Date().toISOString().slice(0, 10);
  const [ano, mes] = referencia.split("-");

  let driveFileId: string | null = null;
  let xmlPath: string | null = null;

  try {
    const pasta = await ensureDocumentoFolder({
      nomeCliente: cliente.razao_social,
      tipoDocumento: documento.tipo_documento,
      ano,
      mes,
    });

    const upload = await uploadTextFile({
      nome: arquivoDoDocumento(entrada),
      conteudo: entrada.xml,
      parentFolderId: pasta,
    });

    driveFileId = upload.id;
    xmlPath = upload.webViewLink;
  } catch (error) {
    // O arquivamento no Drive falhar não pode fazer perder o registro fiscal:
    // gravamos assim mesmo e marcamos pendência.
    console.error(
      `[drive] falha ao arquivar ${documento.tipo_documento} do cliente ${cliente.id}:`,
      error instanceof Error ? error.message : error
    );
  }

  const { data: inserido, error } = await supabase
    .from("documentos_fiscais")
    .insert({
      cliente_id: cliente.id,
      tipo_documento: documento.tipo_documento,
      numero: documento.numero,
      serie: documento.serie,
      chave_acesso: documento.chave_acesso,
      data_emissao: documento.data_emissao,
      valor_total: documento.valor_total,
      emitente_cnpj_cpf: documento.emitente_cnpj_cpf,
      emitente_nome: documento.emitente_nome,
      destinatario_cnpj_cpf: documento.destinatario_cnpj_cpf,
      destinatario_nome: documento.destinatario_nome,
      municipio: documento.municipio,
      uf: documento.uf,
      status_documento: documento.status_documento,
      origem,
      nsu,
      completude: documento.completude,
      drive_file_id: driveFileId,
      xml_storage_path: xmlPath,
      json_dados: documento.json_dados,
      possui_pendencia: !driveFileId || documento.completude === "resumo",
      status_processamento: "Importado",
    })
    .select("id")
    .single();

  if (error) {
    // Corrida entre execuções simultâneas: o índice único resolveu, seguimos.
    if (error.code === "23505") return false;
    throw new Error(
      `Falha ao gravar ${documento.tipo_documento}${nsu ? ` NSU ${nsu}` : ""}: ${error.message}`
    );
  }

  if (!driveFileId && inserido) {
    await supabase.from("documentos_fiscais_pendencias").insert({
      documento_fiscal_id: inserido.id,
      cliente_id: cliente.id,
      tipo_pendencia: "ARQUIVAMENTO",
      descricao: `XML de ${documento.tipo_documento} nao foi arquivado no Google Drive; reprocessar.`,
    });
  }

  if (
    entrada.registrarPendenciaDeManifestacao !== false &&
    documento.completude === "resumo" &&
    inserido
  ) {
    await supabase.from("documentos_fiscais_pendencias").insert({
      documento_fiscal_id: inserido.id,
      cliente_id: cliente.id,
      tipo_pendencia: "AGUARDA_MANIFESTACAO",
      descricao:
        "Recebido apenas o resumo. O XML completo exige manifestacao do destinatario (Ciencia da Operacao).",
    });
  }

  if (documento.completude === "completo" && documento.chave_acesso) {
    await substituirResumo(supabase, cliente.id, documento.chave_acesso);
  }

  return true;
}

/**
 * O resumo perde a razão de existir quando o XML integral da mesma nota chega.
 * São registros distintos, então ambos ficam gravados; sem marcar o antigo, a
 * mesma nota aparece duas vezes para quem consulta.
 */
export async function substituirResumo(
  supabase: SupabaseClient,
  clienteId: string,
  chave: string
) {
  const { data: resumos } = await supabase
    .from("documentos_fiscais")
    .select("id")
    .eq("cliente_id", clienteId)
    .eq("chave_acesso", chave)
    .eq("completude", "resumo");

  if (!resumos?.length) return;

  await supabase
    .from("documentos_fiscais")
    .update({ status_processamento: "Substituido" })
    .in("id", resumos.map((r) => r.id));

  // A pendência de manifestação também deixa de fazer sentido.
  await supabase
    .from("documentos_fiscais_pendencias")
    .update({ status: "RESOLVIDA", resolvido_em: new Date().toISOString() })
    .eq("cliente_id", clienteId)
    .eq("tipo_pendencia", "AGUARDA_MANIFESTACAO")
    .in("documento_fiscal_id", resumos.map((r) => r.id));
}
