/**
 * Confere se o banco tem todas as colunas que o módulo fiscal usa.
 *
 * Existe porque uma migration do repositório (20260703_add_nsu_columns_clientes)
 * nunca chegou a ser aplicada, e o código só descobriria isso ao tentar
 * sincronizar um cliente de verdade.
 *
 *   node scripts/verificar-banco.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function lerEnv() {
  try {
    return Object.fromEntries(
      readFileSync(".env.local", "utf8")
        .split(/\r?\n/)
        .filter((linha) => linha.includes("=") && !linha.trimStart().startsWith("#"))
        .map((linha) => {
          const corte = linha.indexOf("=");
          return [linha.slice(0, corte).trim(), linha.slice(corte + 1).trim()];
        })
    );
  } catch {
    console.error("Nao foi possivel ler .env.local. Rode a partir da raiz do projeto.");
    process.exit(1);
  }
}

const env = { ...lerEnv(), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const chave = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !chave) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const sb = createClient(url, chave, { auth: { persistSession: false } });

const COLUNAS = [
  ["clientes", "identificacao", "CNPJ usado na consulta a SEFAZ"],
  ["clientes", "estado", "UF do autor da consulta"],
  ["clientes", "ultimo_nsu_nfe_recebida", "controle incremental de leitura"],
  ["clientes", "ultima_sincronizacao_nfe", "quando rodou pela ultima vez"],
  ["clientes", "ultima_sincronizacao_nfe_status", "resultado da ultima execucao"],
  ["clientes", "mensagem_ultima_sincronizacao_nfe", "mensagem de erro da ultima execucao"],
  ["clientes", "sincronizacao_nfe_ativa", "liga/desliga o cliente na fila"],
  ["clientes", "proxima_sincronizacao_nfe", "janela de bloqueio da SEFAZ"],
  ["documentos_fiscais", "nsu", "deduplicacao"],
  ["documentos_fiscais", "completude", "resumo x completo x evento"],
  ["documentos_fiscais", "drive_file_id", "arquivo no Google Drive"],
  ["documentos_fiscais", "chave_acesso", "chave de 44 digitos"],
  ["documentos_fiscais", "xml_storage_path", "link do XML"],
  ["documentos_fiscais", "json_dados", "dados auxiliares"],
  ["documentos_fiscais_sincronizacoes", "quantidade_importada", "historico de execucoes"],
  ["documentos_fiscais_pendencias", "tipo_pendencia", "fila de pendencias"],
  ["cliente_certificados", "drive_file_id", "arquivo .pfx"],
  ["cliente_certificados", "senha_criptografada", "senha do certificado"],
  ["cliente_certificados", "principal", "certificado padrao do cliente"],
  ["cliente_certificados", "deleted_at", "exclusao logica"],
];

const faltando = [];

for (const [tabela, coluna, proposito] of COLUNAS) {
  const { error } = await sb.from(tabela).select(coluna).limit(1);
  if (error) {
    console.log(`  FALTA  ${tabela}.${coluna}  (${proposito})`);
    faltando.push({ tabela, coluna });
  } else {
    console.log(`  ok     ${tabela}.${coluna}`);
  }
}

console.log("");

if (faltando.length === 0) {
  console.log("Banco completo. O modulo fiscal tem tudo de que precisa.");
  process.exit(0);
}

console.log(`${faltando.length} coluna(s) faltando.`);
console.log("Aplique as migrations pendentes em supabase/migrations/ pelo SQL Editor.");
process.exit(1);
