/**
 * Renomeia no Drive os XMLs gravados antes da correção de nomenclatura.
 *
 * Até então tudo era salvo como <chave>.xml. Como a mesma nota chega como
 * resumo e depois como XML completo, e os eventos repetem a chave da nota
 * original, a pasta acumulava arquivos de nome idêntico e conteúdo diferente —
 * o Drive permite isso. O banco sabe o que é cada arquivo; usamos ele para
 * desambiguar.
 *
 * Seguro rodar quantas vezes quiser: só renomeia o que está fora do padrão.
 *
 *   node scripts/renomear-arquivos-drive.mjs          (mostra o que faria)
 *   node scripts/renomear-arquivos-drive.mjs --aplicar
 */
import { createClient } from "@supabase/supabase-js";
import { createSign } from "node:crypto";
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

function nomeCorreto(doc) {
  const base = doc.chave_acesso || `${doc.tipo_documento}-nsu${doc.nsu}`;
  if (doc.completude === "completo") return `${base}.xml`;
  if (doc.completude === "resumo") return `${base}-resumo.xml`;
  return `${base}-evento-nsu${doc.nsu}.xml`;
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const b64url = (i) =>
  (Buffer.isBuffer(i) ? i : Buffer.from(i))
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

const conta = JSON.parse(
  Buffer.from(env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_B64, "base64").toString()
);
const agora = Math.floor(Date.now() / 1000);
const cabecalho = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
const corpo = b64url(
  JSON.stringify({
    iss: conta.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: conta.token_uri,
    exp: agora + 3600,
    iat: agora,
  })
);
const assinador = createSign("RSA-SHA256");
assinador.update(`${cabecalho}.${corpo}`);

const auth = await (
  await fetch(conta.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${cabecalho}.${corpo}.${b64url(assinador.sign(conta.private_key))}`,
    }),
  })
).json();

const cab = { Authorization: `Bearer ${auth.access_token}` };

const { data: docs, error } = await sb
  .from("documentos_fiscais")
  .select("id,drive_file_id,chave_acesso,completude,nsu,tipo_documento")
  .not("drive_file_id", "is", null);

if (error) {
  console.error("Erro ao ler documentos:", error.message);
  process.exit(1);
}

console.log(`${docs.length} documentos com arquivo no Drive.`);
if (!aplicar) console.log("(simulação — use --aplicar para renomear de fato)\n");
else console.log("");

let renomeados = 0;
let jaOk = 0;
let falhas = 0;

for (const doc of docs) {
  const desejado = nomeCorreto(doc);

  const info = await fetch(
    `https://www.googleapis.com/drive/v3/files/${doc.drive_file_id}?fields=name&supportsAllDrives=true`,
    { headers: cab }
  );

  if (!info.ok) {
    console.log(`  ! arquivo inacessivel: ${doc.drive_file_id}`);
    falhas += 1;
    continue;
  }

  const { name: atual } = await info.json();

  if (atual === desejado) {
    jaOk += 1;
    continue;
  }

  if (!aplicar) {
    console.log(`  ${atual}\n    -> ${desejado}`);
    renomeados += 1;
    continue;
  }

  const patch = await fetch(
    `https://www.googleapis.com/drive/v3/files/${doc.drive_file_id}?supportsAllDrives=true`,
    {
      method: "PATCH",
      headers: { ...cab, "Content-Type": "application/json" },
      body: JSON.stringify({ name: desejado }),
    }
  );

  if (patch.ok) {
    console.log(`  ok ${desejado}`);
    renomeados += 1;
  } else {
    console.log(`  FALHOU ${desejado}`);
    falhas += 1;
  }
}

console.log(
  `\n${renomeados} ${aplicar ? "renomeados" : "a renomear"}, ${jaOk} ja corretos, ${falhas} falhas`
);
