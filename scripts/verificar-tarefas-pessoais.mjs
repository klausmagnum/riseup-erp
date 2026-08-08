/**
 * Confere se as tabelas das tarefas pessoais do My Desktop estao no ar e se
 * comportam como o codigo espera.
 *
 * Existe pelo mesmo motivo de verificar-banco.mjs: migration do repositorio nao
 * e aplicada pelo deploy, e o defeito so apareceria quando um funcionario
 * tentasse cadastrar uma tarefa de verdade.
 *
 * O teste cria uma tarefa com titulo marcado, exercita as regras e apaga tudo
 * no fim — inclusive se algum passo falhar.
 *
 *   node scripts/verificar-tarefas-pessoais.mjs
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
// A chave anonima e a que vai no JavaScript da pagina, ou seja, e publica.
// Com o RLS ligado e sem policy, ela nao pode enxergar tarefa de ninguem.
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ? createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  : null;
const TITULO_DE_TESTE = "[teste automatico] conferencia das tarefas pessoais";

let falhas = 0;

function conferir(descricao, condicao, detalhe = "") {
  const marca = condicao ? "ok  " : "FALHA";
  if (!condicao) falhas += 1;
  console.log(`${marca} ${descricao}${detalhe ? ` — ${detalhe}` : ""}`);
}

async function main() {
  // 1. As colunas novas existem?
  const { error: erroColunas } = await sb
    .from("tarefas_pessoais")
    .select("id,titulo,clientes_vinculados,regimes")
    .limit(1);
  conferir("colunas clientes_vinculados e regimes na tarefa", !erroColunas, erroColunas?.message);

  const { error: erroCliente } = await sb
    .from("tarefas_pessoais_conclusoes")
    .select("id,cliente_id")
    .limit(1);
  conferir("coluna cliente_id na conclusao", !erroCliente, erroCliente?.message);

  if (erroColunas || erroCliente) {
    console.log("\nFalta rodar uma das migrations. Veja docs/CONFIGURAR-TAREFAS-MYDESKTOP.md.");
    process.exit(1);
  }

  // 2. Um usuario ativo e dois clientes ativos para servirem de cenario.
  const { data: usuarios } = await sb
    .from("usuarios_sistema")
    .select("id,nome")
    .neq("status", "Inativo")
    .limit(2);
  const { data: clientes } = await sb
    .from("clientes")
    .select("id,razao_social,regime_tributario")
    .neq("status", "Inativo")
    .limit(2);

  if (!usuarios?.length || (clientes?.length ?? 0) < 2) {
    console.log("Sem usuario ativo ou sem dois clientes ativos para montar o teste.");
    process.exit(1);
  }

  const dono = usuarios[0];
  const [clienteA, clienteB] = clientes;
  const dia = "2026-08-02";
  let tarefaId = null;

  try {
    // 3. Cadastro com clientes e regime juntos.
    const { data: tarefa, error: erroInsert } = await sb
      .from("tarefas_pessoais")
      .insert({
        usuario_id: dono.id,
        titulo: TITULO_DE_TESTE,
        tipo: "Recorrente",
        recorrencia: "Mensal",
        data_inicio: dia,
        prazo: dia,
        prioridade: "Media",
        clientes_vinculados: [clienteA.id, clienteB.id],
        regimes: ["Simples Nacional"],
      })
      .select("id,clientes_vinculados,regimes")
      .single();

    conferir("cadastrar tarefa com clientes e regime", !erroInsert, erroInsert?.message);
    if (erroInsert) return;

    tarefaId = tarefa.id;
    conferir("clientes gravados", tarefa.clientes_vinculados?.length === 2, `${tarefa.clientes_vinculados?.length} id(s)`);
    conferir("regimes gravados", tarefa.regimes?.length === 1, tarefa.regimes?.join(", "));

    // 4. Dois clientes no mesmo dia: e o que a unicidade antiga impedia.
    const { error: erroA } = await sb
      .from("tarefas_pessoais_conclusoes")
      .insert({ tarefa_id: tarefaId, usuario_id: dono.id, data_ocorrencia: dia, cliente_id: clienteA.id });
    const { error: erroB } = await sb
      .from("tarefas_pessoais_conclusoes")
      .insert({ tarefa_id: tarefaId, usuario_id: dono.id, data_ocorrencia: dia, cliente_id: clienteB.id });

    conferir("finalizar o cliente A no dia", !erroA, erroA?.message);
    conferir("finalizar o cliente B no mesmo dia", !erroB, erroB?.message);

    // 5. O mesmo cliente duas vezes tem que bater na unicidade nova.
    const { error: erroRepetido } = await sb
      .from("tarefas_pessoais_conclusoes")
      .insert({ tarefa_id: tarefaId, usuario_id: dono.id, data_ocorrencia: dia, cliente_id: clienteA.id });
    conferir("recusar o mesmo cliente duas vezes no dia", erroRepetido?.code === "23505", erroRepetido?.code ?? "aceitou");

    // 6. Tarefa sem cliente: o nulo tambem so pode entrar uma vez por dia
    // (e o `nulls not distinct` do indice).
    const { error: erroNulo1 } = await sb
      .from("tarefas_pessoais_conclusoes")
      .insert({ tarefa_id: tarefaId, usuario_id: dono.id, data_ocorrencia: "2026-09-02", cliente_id: null });
    const { error: erroNulo2 } = await sb
      .from("tarefas_pessoais_conclusoes")
      .insert({ tarefa_id: tarefaId, usuario_id: dono.id, data_ocorrencia: "2026-09-02", cliente_id: null });

    conferir("concluir tarefa sem cliente", !erroNulo1, erroNulo1?.message);
    conferir("recusar a mesma conclusao sem cliente", erroNulo2?.code === "23505", erroNulo2?.code ?? "aceitou");

    // 7. O recorte por dono, que e o que a rota da API aplica.
    const { data: doOutro } = await sb
      .from("tarefas_pessoais")
      .select("id")
      .eq("id", tarefaId)
      .neq("usuario_id", dono.id);
    conferir("tarefa nao aparece filtrando por outro dono", (doOutro?.length ?? 0) === 0, `${doOutro?.length ?? 0} linha(s)`);

    // 8. A chave publica do browser nao pode ler a tarefa recem-criada.
    if (anon) {
      const { data: comAnon, error: erroAnon } = await anon.from("tarefas_pessoais").select("id,titulo");
      conferir(
        "chave anonima nao le tarefa nenhuma",
        (comAnon?.length ?? 0) === 0,
        erroAnon ? `bloqueada: ${erroAnon.code ?? erroAnon.message}` : `${comAnon?.length ?? 0} linha(s)`
      );
    }

    // 9. Apagar a tarefa leva as conclusoes junto.
    await sb.from("tarefas_pessoais").delete().eq("id", tarefaId);
    tarefaId = null;

    const { data: orfas } = await sb.from("tarefas_pessoais_conclusoes").select("id").eq("tarefa_id", tarefa.id);
    conferir("conclusoes somem junto com a tarefa", (orfas?.length ?? 0) === 0, `${orfas?.length ?? 0} sobrando`);
  } finally {
    if (tarefaId) await sb.from("tarefas_pessoais").delete().eq("id", tarefaId);
    // Rede de seguranca: nada com o titulo de teste pode ficar para tras.
    await sb.from("tarefas_pessoais").delete().eq("titulo", TITULO_DE_TESTE);
  }

  const { data: restos } = await sb.from("tarefas_pessoais").select("id").eq("titulo", TITULO_DE_TESTE);
  conferir("nenhum resto de teste no banco", (restos?.length ?? 0) === 0, `${restos?.length ?? 0} linha(s)`);

  console.log(falhas === 0 ? "\nTarefas pessoais prontas." : `\n${falhas} verificacao(oes) falharam.`);
  process.exit(falhas === 0 ? 0 : 1);
}

main();
