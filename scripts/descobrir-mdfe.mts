/**
 * Confere a captura de MDF-e contra o ambiente real, sem gravar nada.
 *
 * Usa o mesmo caminho de código da sincronização — buscarLoteDFe com o serviço
 * da MDF-e e normalizarDocumentoMDFe — e imprime o que seria gravado. Serve
 * para validar o parser contra manifesto de verdade antes de escrever no banco.
 *
 *   npx tsx scripts/descobrir-mdfe.mts --cnpj 49039801000150
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { buscarLoteDFe } from "../app/lib/sefaz/distribuicaoDFe.ts";
import { normalizarDocumentoMDFe } from "../app/lib/sefaz/parseMDFe.ts";
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
  servico: "mdfe",
});

console.log(`cStat ${lote.cStat} — ${lote.xMotivo}`);
console.log(`ultNSU ${lote.ultNSU} de maxNSU ${lote.maxNSU}`);
console.log(`documentos no lote: ${lote.documentos.length}\n`);

const porTipo = new Map<string, number>();
const semParser: string[] = [];
let emitidas = 0;

for (const doc of lote.documentos) {
  const normalizado = await normalizarDocumentoMDFe(doc, {
    cnpjCliente: cnpj,
    nomeCliente: cliente.razao_social,
  });

  if (!normalizado) {
    semParser.push(`${doc.nsu} ${doc.schema}`);
    continue;
  }

  const rotulo = `${normalizado.tipo_documento}/${normalizado.completude}`;
  porTipo.set(rotulo, (porTipo.get(rotulo) ?? 0) + 1);

  if (normalizado.emitente_cnpj_cpf.replace(/\D/g, "") === cnpj) emitidas += 1;
}

console.log("=== o que seria gravado ===");
for (const [t, n] of [...porTipo].sort()) console.log(`  ${String(n).padStart(3)}  ${t}`);
console.log(`\ndocumentos emitidos pelo proprio cliente: ${emitidas}`);

if (semParser.length > 0) {
  console.log(`\nschemas sem parser (seriam descartados): ${semParser.length}`);
  for (const s of semParser) console.log(`  ${s}`);
}

console.log("\n=== amostra detalhada ===");
let mostrados = 0;
for (const doc of lote.documentos) {
  if (mostrados >= 3) break;
  const d = await normalizarDocumentoMDFe(doc, {
    cnpjCliente: cnpj,
    nomeCliente: cliente.razao_social,
  });
  if (!d || d.completude === "evento") continue;
  mostrados += 1;

  const j = d.json_dados as Record<string, unknown>;
  console.log(`\n  MDF-e n. ${d.numero}/${d.serie}  ${d.data_emissao}`);
  console.log(`    emitente:    ${d.emitente_nome} [${d.emitente_cnpj_cpf}]`);
  console.log(`    contratante: ${d.destinatario_cnpj_cpf || "—"}`);
  console.log(`    modal ${j.modal} · ${j.tipoEmitente}`);
  console.log(`    percurso: ${j.percurso}   placa ${j.placaVeiculo}`);
  console.log(`    carrega em ${JSON.stringify(j.municipiosCarregamento)}`);
  console.log(`    descarrega em ${JSON.stringify(j.municipiosDescarga)}`);
  console.log(`    ${j.quantidadeNFe} NF-e e ${j.quantidadeCTe} CT-e, carga R$ ${j.valorCarga}`);
  console.log(`    chave (${d.chave_acesso.length} digitos, modelo ${d.chave_acesso.slice(20, 22)})`);
  console.log(`    situacao: ${d.status_documento}`);
}

const eventos = new Map<string, number>();
for (const doc of lote.documentos) {
  const d = await normalizarDocumentoMDFe(doc, { cnpjCliente: cnpj });
  if (d?.completude !== "evento") continue;
  eventos.set(d.status_documento, (eventos.get(d.status_documento) ?? 0) + 1);
}

if (eventos.size > 0) {
  console.log("\n=== eventos ===");
  for (const [e, n] of [...eventos].sort()) console.log(`  ${String(n).padStart(3)}  ${e}`);
}
