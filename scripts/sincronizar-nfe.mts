/**
 * Dispara a captura de NF-e de um cliente pela linha de comando.
 *
 * Grava no banco e arquiva no Drive — não é um verificador, é a sincronização
 * de verdade. Serve para tirar um atraso grande de uma vez: aqui não existe o
 * limite de execução da função serverless, então a fila da SEFAZ pode ser
 * drenada inteira numa sentada, em vez de ~50 documentos por vez.
 *
 *   npx tsx scripts/sincronizar-nfe.mts --cnpj 49039801000150
 *   npx tsx scripts/sincronizar-nfe.mts --cnpj 49039801000150 --lotes 40 --minutos 30
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  sincronizarClienteNFe,
  type ClienteSincronizavel,
} from "../app/lib/sefaz/sincronizarCliente.ts";
import type { RegistroCertificado } from "../app/lib/sefaz/certificado.ts";

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

const argumentos = process.argv;
const cnpjAlvo = argumentos[argumentos.indexOf("--cnpj") + 1]?.replace(/\D/g, "");
const maxLotes = Number(argumentos[argumentos.indexOf("--lotes") + 1]) || 40;
const minutos = Number(argumentos[argumentos.indexOf("--minutos") + 1]) || 30;

if (!cnpjAlvo || cnpjAlvo.length !== 14) {
  console.error("informe o CNPJ: --cnpj 49039801000150");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const { data: clientes } = await supabase
  .from("clientes")
  .select(
    "id,razao_social,identificacao,estado,ultimo_nsu_nfe_recebida,proxima_sincronizacao_nfe"
  )
  .eq("status", "Ativo")
  .returns<Array<ClienteSincronizavel & { proxima_sincronizacao_nfe: string | null }>>();

const cliente = clientes?.find(
  (c) => (c.identificacao ?? "").replace(/\D/g, "") === cnpjAlvo
);

if (!cliente) {
  console.error(`nenhum cliente ativo com o CNPJ ${cnpjAlvo}.`);
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

// O agendamento respeita esta janela; aqui é o operador que decide. Consultar
// dentro dela renova o bloqueio de uma hora e não traz documento nenhum.
const bloqueadoAte = cliente.proxima_sincronizacao_nfe
  ? new Date(cliente.proxima_sincronizacao_nfe)
  : null;

if (bloqueadoAte && bloqueadoAte > new Date()) {
  const faltam = Math.ceil((bloqueadoAte.getTime() - Date.now()) / 60_000);
  console.error(
    `a SEFAZ bloqueou este CNPJ ate ${bloqueadoAte.toLocaleString("pt-BR")} ` +
      `(faltam ${faltam} min). Consultar antes disso renova o bloqueio.`
  );
  process.exit(1);
}

console.log(`cliente: ${cliente.razao_social} (${cliente.estado})`);
console.log(`certificado: ${certificado.nome}`);
console.log(`NSU de partida: ${cliente.ultimo_nsu_nfe_recebida ?? 0}`);
console.log(`limite: ${maxLotes} lotes, ${minutos} minutos\n`);

const inicio = Date.now();

const resultado = await sincronizarClienteNFe({
  supabase,
  cliente,
  certificado,
  ambiente: "producao",
  deadline: Date.now() + minutos * 60_000,
  maxLotes,
});

console.log(`status: ${resultado.status}`);
console.log(`encontrados: ${resultado.encontrados}`);
console.log(`importados: ${resultado.importados}`);
console.log(`erros: ${resultado.erros}`);
console.log(`NSU alcancado: ${resultado.ultimoNsu}`);
console.log(`mensagem: ${resultado.mensagem}`);
console.log(`duracao: ${Math.round((Date.now() - inicio) / 1000)}s`);
