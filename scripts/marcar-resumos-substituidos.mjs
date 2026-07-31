/**
 * Marca como substituído todo resumo cuja nota já chegou em XML completo.
 *
 * A distribuição entrega a nota duas vezes, com NSUs diferentes: primeiro o
 * resumo, depois o XML integral. Ambos ficam gravados — o que é correto para
 * auditoria — mas na consulta do dia a dia a nota apareceria duplicada.
 *
 * A sincronização já faz isso ao gravar. Este script existe para os documentos
 * capturados antes da correção. É seguro rodar quantas vezes quiser.
 *
 *   node scripts/marcar-resumos-substituidos.mjs            (simula)
 *   node scripts/marcar-resumos-substituidos.mjs --aplicar
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const aplicar = process.argv.includes("--aplicar");

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => {
      const c = l.indexOf("=");
      return [l.slice(0, c).trim(), l.slice(c + 1).trim()];
    })
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data, error } = await sb
  .from("documentos_fiscais")
  .select("id,cliente_id,chave_acesso,completude,status_processamento")
  .is("deleted_at", null)
  .not("chave_acesso", "is", null);

if (error) {
  console.error("Erro ao ler documentos:", error.message);
  process.exit(1);
}

// Chaves que já possuem o XML integral.
const temCompleto = new Set(
  data.filter((d) => d.completude === "completo").map((d) => `${d.cliente_id}|${d.chave_acesso}`)
);

const aMarcar = data.filter(
  (d) =>
    d.completude === "resumo" &&
    d.status_processamento !== "Substituido" &&
    temCompleto.has(`${d.cliente_id}|${d.chave_acesso}`)
);

console.log(`${data.length} documentos analisados.`);
console.log(`${aMarcar.length} resumo(s) ja superados pelo XML completo.`);

if (aMarcar.length === 0) {
  console.log("Nada a fazer.");
  process.exit(0);
}

if (!aplicar) {
  console.log("\n(simulação — use --aplicar para gravar)");
  for (const d of aMarcar.slice(0, 5)) console.log(`  ${d.chave_acesso}`);
  if (aMarcar.length > 5) console.log(`  ... mais ${aMarcar.length - 5}`);
  process.exit(0);
}

const ids = aMarcar.map((d) => d.id);

const { error: erroUpdate } = await sb
  .from("documentos_fiscais")
  .update({ status_processamento: "Substituido" })
  .in("id", ids);

if (erroUpdate) {
  console.error("Falha ao marcar:", erroUpdate.message);
  process.exit(1);
}

// A pendência de manifestação perde o sentido junto.
const { error: erroPend } = await sb
  .from("documentos_fiscais_pendencias")
  .update({ status: "RESOLVIDA", resolvido_em: new Date().toISOString() })
  .in("documento_fiscal_id", ids)
  .eq("tipo_pendencia", "AGUARDA_MANIFESTACAO");

if (erroPend) console.error("Aviso: pendencias nao atualizadas:", erroPend.message);

console.log(`\n${ids.length} resumo(s) marcados como substituidos.`);
