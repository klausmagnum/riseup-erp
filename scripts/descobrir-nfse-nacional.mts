/**
 * Descobre o contrato da distribuição de NFS-e do ambiente nacional.
 *
 * A documentação oficial do ADN não abre sem certificado — o portal responde
 * 403 e 496 (nginx: "cliente não apresentou certificado"). Este script faz a
 * chamada de verdade, com o A1 de um cliente, e imprime o que volta: status,
 * cabeçalhos e uma amostra do corpo. É a partir daqui que dá para escrever o
 * parser sem adivinhar o formato.
 *
 * Só lê. Não emite, não cancela e não grava nada no banco nem no Drive.
 *
 *   npx tsx scripts/descobrir-nfse-nacional.mts [--producao] [--cnpj 49039801000150]
 */
import { request as httpsRequest } from "node:https";
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { carregarCertificado, type RegistroCertificado } from "../app/lib/sefaz/certificado.ts";

function lerEnv() {
  return Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
      .map((l) => {
        const c = l.indexOf("=");
        return [l.slice(0, c).trim(), l.slice(c + 1).trim()];
      })
  );
}

for (const [chave, valor] of Object.entries(lerEnv())) {
  if (!process.env[chave]) process.env[chave] = valor as string;
}

const producao = process.argv.includes("--producao");
const cnpjPedido = process.argv[process.argv.indexOf("--cnpj") + 1]?.replace(/\D/g, "");

const HOST = producao ? "adn.nfse.gov.br" : "adn.producaorestrita.nfse.gov.br";

/** Caminhos candidatos. O manual público cita o primeiro; os outros existem
 *  para o caso de a rota do contribuinte estar sob outro prefixo. */
const CAMINHOS = [
  "/contribuintes/DFe/0",
  "/DFe/0",
  "/contribuintes/dfe/0",
];

interface Resposta {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  corpo: Buffer;
}

function get(
  caminho: string,
  certificado: { pfx: Buffer; senha: string }
): Promise<Resposta> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        host: HOST,
        path: caminho,
        method: "GET",
        pfx: certificado.pfx,
        passphrase: certificado.senha,
        headers: { Accept: "application/json", "User-Agent": "RiseUP-ERP/descoberta" },
        timeout: 30_000,
      },
      (res) => {
        const pedacos: Buffer[] = [];
        res.on("data", (d) => pedacos.push(d));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            corpo: Buffer.concat(pedacos),
          })
        );
      }
    );

    req.on("timeout", () => req.destroy(new Error("timeout de 30s")));
    req.on("error", reject);
    req.end();
  });
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

console.log(`ambiente: ${producao ? "PRODUCAO" : "producao restrita"} (${HOST})\n`);

// Escolhe um certificado ativo. Sem --cnpj, pega o primeiro que existir.
let consulta = supabase
  .from("cliente_certificados")
  .select("id,cliente_id,nome,drive_file_id,senha_criptografada,data_validade,ativo,cnpj_cpf_titular")
  .eq("ativo", true)
  .is("deleted_at", null)
  .limit(5);

const { data: certificados, error } = await consulta;

if (error) {
  console.error("falha ao consultar certificados:", error.message);
  process.exit(1);
}

const escolhido = cnpjPedido
  ? certificados?.find((c) => (c.cnpj_cpf_titular ?? "").replace(/\D/g, "") === cnpjPedido)
  : certificados?.[0];

if (!escolhido) {
  console.error("nenhum certificado ativo encontrado.");
  process.exit(1);
}

console.log(`certificado: ${escolhido.nome} (titular ${escolhido.cnpj_cpf_titular ?? "?"})`);

const credenciais = await carregarCertificado(escolhido as RegistroCertificado);
console.log(`pfx carregado do Drive: ${credenciais.pfx.length} bytes\n`);

const caminho = CAMINHOS[0];
console.log(`GET https://${HOST}${caminho}\n`);

const r = await get(caminho, credenciais);
console.log(`status: ${r.status}`);
console.log(`content-type: ${r.headers["content-type"]}`);
console.log(`bytes: ${r.corpo.length}`);

for (const [h, v] of Object.entries(r.headers)) {
  if (/ratelimit|retry|nsu|pagina|count/i.test(h)) console.log(`header ${h}: ${v}`);
}

const json = JSON.parse(r.corpo.toString("utf8"));

console.log(`\nchaves do envelope: ${Object.keys(json).join(", ")}`);
for (const [k, v] of Object.entries(json)) {
  if (!Array.isArray(v)) console.log(`  ${k} = ${JSON.stringify(v)}`);
}

const lote = json.LoteDFe ?? [];
console.log(`\ndocumentos no lote: ${lote.length}`);

if (lote.length > 0) {
  console.log(`campos de cada item: ${Object.keys(lote[0]).join(", ")}`);
  console.log(`NSU do primeiro ao ultimo: ${lote[0].NSU} .. ${lote[lote.length - 1].NSU}`);

  const tipos = new Map<string, number>();
  const tamanhosChave = new Map<number, number>();
  for (const d of lote) {
    tipos.set(d.TipoDocumento, (tipos.get(d.TipoDocumento) ?? 0) + 1);
    const t = String(d.ChaveAcesso ?? "").length;
    tamanhosChave.set(t, (tamanhosChave.get(t) ?? 0) + 1);
  }
  console.log(`tipos: ${[...tipos].map(([t, n]) => `${t}=${n}`).join(", ")}`);
  console.log(`tamanho da chave: ${[...tamanhosChave].map(([t, n]) => `${t} digitos (${n}x)`).join(", ")}`);

  // O XML vem em base64 de gzip, igual ao docZip da NF-e.
  const bruto = Buffer.from(lote[0].ArquivoXml, "base64");
  const xml = gunzipSync(bruto).toString("utf8");

  console.log(`\nXML do NSU ${lote[0].NSU} (${xml.length} caracteres):`);
  console.log(xml.slice(0, 2500).split("\n").map((l) => `  ${l}`).join("\n"));

  const raizes = new Set<string>();
  for (const d of lote) {
    const x = gunzipSync(Buffer.from(d.ArquivoXml, "base64")).toString("utf8");
    const m = x.match(/<([A-Za-z][\w:.-]*)[\s>]/);
    if (m) raizes.add(m[1]);
  }
  console.log(`\nelementos raiz encontrados no lote: ${[...raizes].join(", ")}`);

  // O evento tem outro formato e vai precisar de parser próprio.
  const evento = lote.find((d: { TipoDocumento: string }) => d.TipoDocumento !== "NFSE");
  if (evento) {
    const x = gunzipSync(Buffer.from(evento.ArquivoXml, "base64")).toString("utf8");
    console.log(`\n--- ${evento.TipoDocumento} no NSU ${evento.NSU} ---`);
    console.log(x.slice(0, 1600).split("\n").map((l) => `  ${l}`).join("\n"));
  }
}

// Como a API sinaliza que não há mais nada: pergunta por um NSU alto demais.
// É o que o laço de paginação vai usar como condição de parada.
console.log(`\n\n=== fim da fila: GET /contribuintes/DFe/999999999 ===`);
const vazio = await get("/contribuintes/DFe/999999999", credenciais);
console.log(`status: ${vazio.status}`);
console.log(`corpo: ${vazio.corpo.subarray(0, 600).toString("utf8")}`);
