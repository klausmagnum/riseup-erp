/**
 * Testa a conexão com o Google Drive de ponta a ponta.
 *
 * Faz o ciclo completo — autentica, lê a pasta, cria subpasta, sobe arquivo,
 * lê de volta e apaga — porque cada etapa falha por um motivo diferente e o
 * erro mais comum (conta de serviço sem cota) só aparece no upload.
 *
 *   node scripts/verificar-drive.mjs
 */
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

function lerEnv() {
  try {
    return Object.fromEntries(
      readFileSync(".env.local", "utf8")
        .split(/\r?\n/)
        .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
        .map((l) => {
          const corte = l.indexOf("=");
          return [l.slice(0, corte).trim(), l.slice(corte + 1).trim()];
        })
    );
  } catch {
    console.error("Nao consegui ler .env.local. Rode a partir da raiz do projeto.");
    process.exit(1);
  }
}

const env = { ...lerEnv(), ...process.env };
const b64 = env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_B64;
const pastaRaiz = env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

function parar(mensagem, dica) {
  console.error(`\n  ERRO: ${mensagem}`);
  if (dica) console.error(`  ${dica}\n`);
  process.exit(1);
}

if (!b64 || b64.startsWith("COLE_AQUI")) {
  parar(
    "GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_B64 nao foi preenchida.",
    "Etapa 4 do guia: converta o arquivo .json em base64 e cole no .env.local."
  );
}

if (!pastaRaiz || pastaRaiz.startsWith("COLE_AQUI")) {
  parar(
    "GOOGLE_DRIVE_ROOT_FOLDER_ID nao foi preenchida.",
    "Etapa 3 do guia: e o trecho da URL da pasta depois de /folders/."
  );
}

let conta;
try {
  conta = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
} catch {
  parar(
    "O valor de GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_B64 nao e um JSON valido em base64.",
    "Refaca a etapa 4. O texto deve ser uma linha unica, sem quebras nem aspas."
  );
}

if (!conta.client_email || !conta.private_key) {
  parar("O JSON nao parece ser de uma conta de servico (faltam client_email/private_key).");
}

console.log(`\n  Conta de servico: ${conta.client_email}`);
console.log(`  Pasta raiz:       ${pastaRaiz}\n`);

// ---- 1. Autenticação ----
const agora = Math.floor(Date.now() / 1000);
// Precisa aceitar Buffer: codificar a assinatura ja convertida em base64
// produziria base64 de base64, e o Google recusa com "Invalid JWT Signature".
const b64url = (entrada) =>
  (Buffer.isBuffer(entrada) ? entrada : Buffer.from(entrada))
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

const cabecalho = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
const corpo = b64url(
  JSON.stringify({
    iss: conta.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: conta.token_uri || "https://oauth2.googleapis.com/token",
    exp: agora + 3600,
    iat: agora,
  })
);

const assinador = createSign("RSA-SHA256");
assinador.update(`${cabecalho}.${corpo}`);
const jwt = `${cabecalho}.${corpo}.${b64url(assinador.sign(conta.private_key))}`;

const respAuth = await fetch(conta.token_uri || "https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  }),
});

const auth = await respAuth.json();
if (!auth.access_token) {
  parar(
    `Autenticacao falhou: ${auth.error_description || auth.error}`,
    "Confira se a Google Drive API foi ativada no projeto (etapa 2 do guia)."
  );
}
console.log("  ok  1/5  autenticou no Google");

const cab = { Authorization: `Bearer ${auth.access_token}` };

// ---- 2. Leitura da pasta raiz ----
const respPasta = await fetch(
  `https://www.googleapis.com/drive/v3/files/${pastaRaiz}?fields=id,name,mimeType,driveId&supportsAllDrives=true`,
  { headers: cab }
);

if (!respPasta.ok) {
  const erro = await respPasta.json().catch(() => ({}));
  parar(
    `Nao consegui abrir a pasta: ${erro.error?.message || respPasta.statusText}`,
    `Compartilhe a pasta com ${conta.client_email} como Gerenciador de conteudo (etapa 3).`
  );
}

const pasta = await respPasta.json();
console.log(`  ok  2/5  leu a pasta "${pasta.name}"`);

if (!pasta.driveId) {
  console.log("\n  ATENCAO: esta pasta nao esta num Drive Compartilhado.");
  console.log("  O upload provavelmente vai falhar por falta de cota — conta de");
  console.log("  servico tem zero de espaco proprio. Veja a etapa 1 do guia.\n");
}

// ---- 3. Criação de subpasta ----
const respNova = await fetch(
  "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id",
  {
    method: "POST",
    headers: { ...cab, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `_teste_riseup_${Date.now()}`,
      mimeType: "application/vnd.google-apps.folder",
      parents: [pastaRaiz],
    }),
  }
);

if (!respNova.ok) {
  const erro = await respNova.json().catch(() => ({}));
  parar(`Nao consegui criar subpasta: ${erro.error?.message || respNova.statusText}`);
}

const { id: idTeste } = await respNova.json();
console.log("  ok  3/5  criou subpasta de teste");

// ---- 4. Upload ----
const form = new FormData();
form.append(
  "metadata",
  new Blob([JSON.stringify({ name: "teste.xml", parents: [idTeste] })], {
    type: "application/json",
  })
);
form.append("file", new Blob(["<teste>ok</teste>"], { type: "application/xml" }));

const respUp = await fetch(
  "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id",
  { method: "POST", headers: cab, body: form }
);

if (!respUp.ok) {
  const erro = await respUp.json().catch(() => ({}));
  const msg = erro.error?.message || respUp.statusText;
  await fetch(`https://www.googleapis.com/drive/v3/files/${idTeste}?supportsAllDrives=true`, {
    method: "DELETE",
    headers: cab,
  });

  if (/quota/i.test(msg)) {
    parar(
      "Upload negado por falta de cota de armazenamento.",
      "A pasta precisa estar num Drive Compartilhado, nao no Meu Drive. Etapa 1 do guia."
    );
  }
  parar(`Upload falhou: ${msg}`);
}

const { id: idArquivo } = await respUp.json();
console.log("  ok  4/5  subiu arquivo de teste");

// ---- 5. Leitura de volta ----
const respLer = await fetch(
  `https://www.googleapis.com/drive/v3/files/${idArquivo}?alt=media&supportsAllDrives=true`,
  { headers: cab }
);
const conteudo = await respLer.text();

if (conteudo !== "<teste>ok</teste>") {
  parar(`O arquivo voltou diferente do que subiu: "${conteudo}"`);
}
console.log("  ok  5/5  leu o arquivo de volta");

// ---- Limpeza ----
await fetch(`https://www.googleapis.com/drive/v3/files/${idTeste}?supportsAllDrives=true`, {
  method: "DELETE",
  headers: cab,
});

console.log("\n  Google Drive configurado corretamente. Pasta de teste removida.\n");
