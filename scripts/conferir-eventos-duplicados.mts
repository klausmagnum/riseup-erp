/**
 * Completa o `nSeqEvento` dos eventos capturados antes de ele passar a ser
 * gravado, e confere de passagem se algum deles é mesmo linha repetida.
 *
 * Entre 31/07 e 02/08/2026 o parser não guardava a sequência do evento. Sem ela,
 * a deduplicação de `gravarDocumento.ts` cai para comparar só o NSU — e como a
 * SEFAZ reentrega o mesmo evento sob NSU novo, uma reentrega de qualquer um
 * desses 91 eventos entraria no banco como linha nova. É um buraco pequeno e
 * silencioso: só aparece quando a reentrega acontece.
 *
 * A conferência veio primeiro e derrubou a suspeita que originou o script: os
 * grupos que pareciam repetidos são comprovantes de entrega sucessivos do mesmo
 * CT-e (nSeqEvento 001, 002, 003...), eventos distintos com data e conteúdo
 * próprios. Agrupá-los sem a sequência é que os fazia parecer iguais.
 *
 * O XML integral está arquivado no Drive, então a sequência vem de lá.
 *
 *   npx tsx scripts/conferir-eventos-duplicados.mts             # só relata
 *   npx tsx scripts/conferir-eventos-duplicados.mts --completar # grava
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { parseStringPromise } from "xml2js";

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

const { getDriveFile } = await import("../app/lib/googleDriveServer.ts");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

interface Linha {
  id: string;
  chave_acesso: string;
  nsu: string | null;
  created_at: string;
  tipo_documento: string;
  drive_file_id: string | null;
  json_dados: Record<string, unknown> | null;
}

const { data: eventos } = await supabase
  .from("documentos_fiscais")
  .select("id,chave_acesso,nsu,created_at,tipo_documento,drive_file_id,json_dados")
  .eq("completude", "evento")
  .not("chave_acesso", "is", null)
  .returns<Linha[]>();

// Agrupa como a deduplicação agrupava: sem sequência, tudo que tem a mesma
// chave e o mesmo tipo cai no mesmo balde.
const grupos = new Map<string, Linha[]>();
for (const linha of eventos ?? []) {
  const tipo = String(linha.json_dados?.tpEvento ?? "?");
  const seq = linha.json_dados?.nSeqEvento;
  // Onde a sequência já foi gravada, a deduplicação atual dá conta.
  if (seq !== undefined && seq !== null) continue;

  const chave = `${linha.chave_acesso}|${tipo}`;
  if (!grupos.has(chave)) grupos.set(chave, []);
  grupos.get(chave)!.push(linha);
}

const suspeitos = [...grupos.entries()].filter(([, linhas]) => linhas.length > 1);

console.log(`eventos sem nSeqEvento gravado: ${[...grupos.values()].flat().length}`);
console.log(`grupos com mais de uma linha: ${suspeitos.length}\n`);

/** Lê o `nSeqEvento` direto do XML arquivado. */
async function sequenciaDoXml(fileId: string) {
  const buffer = await getDriveFile(fileId);
  const xml = buffer.toString("utf8");
  const parsed = await parseStringPromise(xml, {
    explicitArray: false,
    tagNameProcessors: [(n: string) => n.replace(/^.*:/, "")],
  });

  // O evento integral (procEventoNFe/procEventoCTe) guarda os campos dentro de
  // infEvento; o resumo (resEvento_v1.01.xsd) os põe na raiz do próprio
  // elemento. Procurar pelo campo, e não pelo caminho, cobre os dois sem
  // precisar saber de antemão qual schema veio.
  let info: Record<string, unknown> | null = null;
  const procurar = (no: unknown): void => {
    if (info || !no || typeof no !== "object") return;
    const reg = no as Record<string, unknown>;
    if (reg.nSeqEvento !== undefined || reg.tpEvento !== undefined) {
      info = reg;
      return;
    }
    for (const v of Object.values(reg)) procurar(v);
  };
  procurar(parsed);

  const dados = (info ?? {}) as Record<string, unknown>;
  return {
    tpEvento: String(dados.tpEvento ?? "?"),
    nSeqEvento: String(dados.nSeqEvento ?? "?"),
    dhEvento: String(dados.dhEvento ?? "?"),
    // O digest do XML inteiro decide o caso em que tudo mais empata.
    hash: createHash("sha256").update(xml).digest("hex").slice(0, 12),
  };
}

let redundantes = 0;
let distintos = 0;

for (const [chave, linhas] of suspeitos) {
  console.log(`=== ${chave}  (${linhas.length} linhas)`);
  const vistos = new Map<string, Linha[]>();

  for (const linha of linhas) {
    if (!linha.drive_file_id) {
      console.log(`  nsu=${linha.nsu}  SEM XML NO DRIVE - nao da para decidir`);
      continue;
    }

    try {
      const info = await sequenciaDoXml(linha.drive_file_id);
      const assinatura = `${info.tpEvento}/${info.nSeqEvento}/${info.dhEvento}/${info.hash}`;
      console.log(
        `  nsu=${String(linha.nsu).padStart(15)}  tpEvento=${info.tpEvento}  nSeq=${info.nSeqEvento}  dh=${info.dhEvento}  sha=${info.hash}`
      );
      if (!vistos.has(assinatura)) vistos.set(assinatura, []);
      vistos.get(assinatura)!.push(linha);
    } catch (error) {
      console.log(
        `  nsu=${linha.nsu}  FALHA ao ler o XML: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  for (const [assinatura, iguais] of vistos) {
    if (iguais.length > 1) {
      redundantes += iguais.length - 1;
      const manter = iguais.reduce((a, b) => (a.created_at <= b.created_at ? a : b));
      console.log(`  -> ${iguais.length} copias do mesmo evento (${assinatura.slice(0, 20)}...)`);
      console.log(`     manter nsu=${manter.nsu}; sobram ${iguais.length - 1} redundantes`);
      console.log(
        `     ids redundantes: ${iguais.filter((l) => l.id !== manter.id).map((l) => l.id).join(", ")}`
      );
    } else {
      distintos += 1;
    }
  }
  console.log("");
}

console.log("====================================================");
console.log(`linhas realmente redundantes (mesmo XML): ${redundantes}`);
console.log(`eventos distintos que so pareciam iguais: ${distintos}`);
console.log("====================================================\n");

// Completar a sequência é o que fecha o buraco de verdade: com ela gravada, a
// deduplicação volta a reconhecer uma reentrega desses eventos antigos em vez
// de depender do NSU, que muda a cada reentrega.
const completar = process.argv.includes("--completar");
const pendentes = [...grupos.values()].flat().filter((l) => l.drive_file_id);

if (!completar) {
  console.log(`${pendentes.length} eventos sem sequencia gravada.`);
  console.log("rode com --completar para preencher a partir do XML arquivado.");
  process.exit(0);
}

let preenchidos = 0;
let semSequencia = 0;
let falhas = 0;

for (const linha of pendentes) {
  try {
    const info = await sequenciaDoXml(linha.drive_file_id!);

    // Sem sequência no XML não há o que gravar; anotar tipo errado seria pior
    // que deixar como está.
    if (info.nSeqEvento === "?") {
      semSequencia += 1;
      continue;
    }

    const { error } = await supabase
      .from("documentos_fiscais")
      .update({
        json_dados: {
          ...(linha.json_dados ?? {}),
          tpEvento: info.tpEvento,
          nSeqEvento: info.nSeqEvento,
          dhEvento: info.dhEvento,
        },
      })
      .eq("id", linha.id);

    if (error) throw new Error(error.message);
    preenchidos += 1;
  } catch (error) {
    falhas += 1;
    console.log(
      `  falha em nsu=${linha.nsu}: ${error instanceof Error ? error.message : error}`
    );
  }
}

console.log(`sequencia preenchida: ${preenchidos}`);
console.log(`sem sequencia no proprio XML: ${semSequencia}`);
console.log(`falhas: ${falhas}`);
