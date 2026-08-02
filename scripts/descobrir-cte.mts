/**
 * Confere a captura de CT-e contra o ambiente real, sem gravar nada.
 *
 * Usa o mesmo caminho de código da sincronização — buscarLoteDFe com o serviço
 * do CT-e e normalizarDocumentoCTe — e imprime o que seria gravado. Serve para
 * validar o parser contra documento de verdade antes de escrever no banco.
 *
 *   npx tsx scripts/descobrir-cte.mts --cnpj 49039801000150
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { buscarLoteDFe } from "../app/lib/sefaz/distribuicaoDFe.ts";
import { normalizarDocumentoCTe } from "../app/lib/sefaz/parseCTe.ts";
import { carregarCertificado, type RegistroCertificado } from "../app/lib/sefaz/certificado.ts";

for (const [chave, valor] of Object.entries(
  Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
      .map((l) => {
        const c = l.indexOf("=");
        return [l.slice(0, c).trim(), l.slice(c + 1).trim()];
      })
  )
)) {
  if (!process.env[chave]) process.env[chave] = valor as string;
}

const cnpjPedido = process.argv[process.argv.indexOf("--cnpj") + 1]?.replace(/\D/g, "");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const { data: clientes } = await supabase
  .from("clientes")
  .select("id,razao_social,identificacao,estado")
  .eq("status", "Ativo");

const cliente = clientes?.find(
  (c) => (c.identificacao ?? "").replace(/\D/g, "") === cnpjPedido
);

if (!cliente) {
  console.error(`nenhum cliente ativo com o CNPJ ${cnpjPedido}`);
  process.exit(1);
}

const { data: registro } = await supabase
  .from("cliente_certificados")
  .select("id,cliente_id,nome,drive_file_id,senha_criptografada,data_validade,ativo")
  .eq("cliente_id", cliente.id)
  .eq("ativo", true)
  .is("deleted_at", null)
  .order("principal", { ascending: false })
  .limit(1)
  .maybeSingle<RegistroCertificado>();

const credenciais = await carregarCertificado(registro!);
const cnpj = (cliente.identificacao ?? "").replace(/\D/g, "");

console.log(`cliente: ${cliente.razao_social} (${cliente.estado})\n`);

const lote = await buscarLoteDFe({
  cnpj,
  uf: cliente.estado ?? "",
  ultNSU: "0",
  certificado: credenciais,
  servico: "cte",
});

console.log(`cStat ${lote.cStat} — ${lote.xMotivo}`);
console.log(`ultNSU ${lote.ultNSU} de maxNSU ${lote.maxNSU}`);
console.log(`documentos no lote: ${lote.documentos.length}\n`);

const porTipo = new Map<string, number>();
const semParser: string[] = [];
let comCliente = 0;

for (const doc of lote.documentos) {
  const normalizado = await normalizarDocumentoCTe(doc, {
    cnpjCliente: cnpj,
    nomeCliente: cliente.razao_social,
  });

  if (!normalizado) {
    semParser.push(`${doc.nsu} ${doc.schema}`);
    continue;
  }

  const rotulo = `${normalizado.tipo_documento}/${normalizado.completude}`;
  porTipo.set(rotulo, (porTipo.get(rotulo) ?? 0) + 1);

  if (normalizado.json_dados.clienteEhTomador) comCliente += 1;
}

console.log("=== o que seria gravado ===");
for (const [t, n] of [...porTipo].sort()) console.log(`  ${String(n).padStart(3)}  ${t}`);
console.log(`\nCT-e em que o cliente e o tomador do frete: ${comCliente}`);

if (semParser.length > 0) {
  console.log(`\nschemas sem parser (seriam descartados): ${semParser.length}`);
  for (const s of semParser) console.log(`  ${s}`);
}

console.log("\n=== amostra detalhada ===");
let mostrados = 0;
for (const doc of lote.documentos) {
  if (mostrados >= 3) break;
  const d = await normalizarDocumentoCTe(doc, {
    cnpjCliente: cnpj,
    nomeCliente: cliente.razao_social,
  });
  if (!d || d.completude === "evento") continue;
  mostrados += 1;

  const j = d.json_dados as Record<string, unknown>;
  console.log(`\n  ${d.tipo_documento} n. ${d.numero}/${d.serie}  ${d.data_emissao}`);
  console.log(`    valor do frete: R$ ${d.valor_total}`);
  console.log(`    transportadora: ${d.emitente_nome} [${d.emitente_cnpj_cpf}]`);
  console.log(`    destinatario:   ${d.destinatario_nome}`);
  console.log(`    tomador:        ${j.tomadorPapel} — ${j.tomadorNome} [${j.tomadorCnpj}]`);
  console.log(`    cliente paga o frete? ${j.clienteEhTomador ? "sim" : "nao"}`);
  console.log(`    percurso: ${j.origem} -> ${j.destino}   CFOP ${j.cfop}`);
  console.log(`    chave (${d.chave_acesso.length} digitos, modelo ${d.chave_acesso.slice(20, 22)})`);
  console.log(`    situacao: ${d.status_documento}`);
}
