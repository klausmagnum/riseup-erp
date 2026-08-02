/**
 * Captura documentos pela chave de acesso, da linha de comando.
 *
 * É o caminho da NFC-e: o modelo 65 não tem fila de NSU no ambiente nacional,
 * então não existe "sincronizar NFC-e" — o que traz a nota é a chave. Serve
 * também para resgatar uma NF-e ou um CT-e avulso que se perdeu.
 *
 * Grava no banco e arquiva no Drive — não é um verificador.
 *
 *   npx tsx scripts/capturar-chave.mts --chave 3526...780
 *   npx tsx scripts/capturar-chave.mts --cnpj 49039801000150 --arquivo chaves.txt
 *
 * Sem --cnpj, o cliente é identificado pelo CNPJ do emitente na própria chave,
 * que é o caso da NFC-e emitida pelo cliente. Para nota de entrada é preciso
 * informar o CNPJ, porque a chave só nomeia quem emitiu.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  capturarChaves,
  type ClienteConsultante,
} from "../app/lib/sefaz/capturarPorChave.ts";
import type { RegistroCertificado } from "../app/lib/sefaz/certificado.ts";

for (const linha of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  if (!linha.includes("=") || linha.trimStart().startsWith("#")) continue;
  const corte = linha.indexOf("=");
  const chave = linha.slice(0, corte).trim();
  if (!process.env[chave]) process.env[chave] = linha.slice(corte + 1).trim();
}

const argumentos = process.argv;
const valorDe = (flag: string) => argumentos[argumentos.indexOf(flag) + 1];

const cnpjAlvo = argumentos.includes("--cnpj")
  ? valorDe("--cnpj")?.replace(/\D/g, "")
  : "";
const arquivo = argumentos.includes("--arquivo") ? valorDe("--arquivo") : "";
const ambiente = argumentos.includes("--homologacao") ? "homologacao" : "producao";

const texto = [
  argumentos.includes("--chave") ? valorDe("--chave") : "",
  arquivo ? readFileSync(arquivo, "utf8") : "",
].join("\n");

const chaves = [...new Set(texto.match(/\d{44}/g) ?? [])];

if (!chaves.length) {
  console.error("informe ao menos uma chave: --chave 3526...780 ou --arquivo chaves.txt");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const { data: clientes } = await supabase
  .from("clientes")
  .select("id,razao_social,identificacao,estado")
  .eq("status", "Ativo")
  .returns<ClienteConsultante[]>();

// Posições 7-20 da chave são o CNPJ do emitente.
const cnpjProcurado = cnpjAlvo || chaves[0].slice(6, 20);

const cliente = clientes?.find(
  (c) => (c.identificacao ?? "").replace(/\D/g, "") === cnpjProcurado
);

if (!cliente) {
  console.error(`nenhum cliente ativo com o CNPJ ${cnpjProcurado}.`);
  process.exit(1);
}

const { data: certificado } = await supabase
  .from("cliente_certificados")
  .select("id,cliente_id,nome,drive_file_id,senha_criptografada,data_validade,ativo")
  .eq("cliente_id", cliente.id)
  .eq("ativo", true)
  .is("deleted_at", null)
  .order("principal", { ascending: false })
  .limit(1)
  .maybeSingle<RegistroCertificado>();

if (!certificado) {
  console.error(`${cliente.razao_social} nao tem certificado ativo cadastrado.`);
  process.exit(1);
}

console.log(`cliente: ${cliente.razao_social} (${cliente.estado})`);
console.log(`certificado: ${certificado.nome}`);
console.log(`ambiente: ${ambiente}`);
console.log(`chaves: ${chaves.length}\n`);

const inicio = Date.now();

const { resultados, naoAlcancadas } = await capturarChaves({
  supabase,
  cliente,
  certificado,
  chaves,
  ambiente,
  deadline: Date.now() + 10 * 60_000,
});

for (const r of resultados) {
  console.log(`${r.chave}  ${r.mensagem}`);
}

const gravados = resultados.reduce((soma, r) => soma + r.gravados, 0);
const duplicados = resultados.reduce((soma, r) => soma + r.duplicados, 0);

console.log(`\ncapturados: ${gravados}`);
console.log(`ja existentes: ${duplicados}`);
console.log(`sem retorno: ${resultados.filter((r) => !r.ok).length}`);
if (naoAlcancadas.length) console.log(`nao alcancadas: ${naoAlcancadas.length}`);
console.log(`duracao: ${Math.round((Date.now() - inicio) / 1000)}s`);
