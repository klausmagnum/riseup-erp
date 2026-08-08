import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { autorizar } from "@/app/lib/apiAuth";

/**
 * Conclusao de uma ocorrencia de tarefa pessoal.
 *
 * A tarefa mensal do dia 02 concluida em agosto continua valendo para setembro,
 * entao o que se guarda e o trio (tarefa, dia, cliente), nao um status na
 * tarefa. Sem cliente — a tarefa solta — o cliente vai nulo.
 */

function ehDataIso(valor: unknown): valor is string {
  return typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor);
}

async function tarefaDoUsuario(adminClient: SupabaseClient, usuarioId: string, tarefaId: string) {
  const { data } = await adminClient
    .from("tarefas_pessoais")
    .select("id")
    .eq("id", tarefaId)
    .eq("usuario_id", usuarioId)
    .maybeSingle();

  return data;
}

export async function POST(request: Request) {
  const auth = await autorizar(request, { recurso: "tarefas pessoais" });
  if (auth.erro) return auth.erro;

  const corpo = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const tarefaId = typeof corpo.tarefaId === "string" ? corpo.tarefaId : "";
  const clienteId = typeof corpo.clienteId === "string" && corpo.clienteId ? corpo.clienteId : null;
  const data = corpo.data;

  if (!tarefaId || !ehDataIso(data)) {
    return NextResponse.json({ error: "Informe a tarefa e o dia que voce concluiu." }, { status: 400 });
  }

  if (!(await tarefaDoUsuario(auth.adminClient, auth.usuario.id, tarefaId))) {
    return NextResponse.json({ error: "Tarefa nao encontrada entre as suas tarefas." }, { status: 404 });
  }

  const { error } = await auth.adminClient.from("tarefas_pessoais_conclusoes").insert({
    tarefa_id: tarefaId,
    usuario_id: auth.usuario.id,
    data_ocorrencia: data,
    cliente_id: clienteId,
  });

  // 23505 e a unicidade (tarefa, dia, cliente): finalizar duas vezes o mesmo
  // item — dois cliques, duas abas — e o mesmo resultado, nao um erro.
  if (error && error.code !== "23505") {
    return NextResponse.json({ error: `Nao foi possivel concluir a tarefa: ${error.message}` }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await autorizar(request, { recurso: "tarefas pessoais" });
  if (auth.erro) return auth.erro;

  const { searchParams } = new URL(request.url);
  const tarefaId = searchParams.get("tarefaId") ?? "";
  const clienteId = searchParams.get("clienteId");
  const data = searchParams.get("data");

  if (!tarefaId || !ehDataIso(data)) {
    return NextResponse.json({ error: "Informe a tarefa e o dia que voce quer reabrir." }, { status: 400 });
  }

  const consulta = auth.adminClient
    .from("tarefas_pessoais_conclusoes")
    .delete()
    .eq("tarefa_id", tarefaId)
    .eq("usuario_id", auth.usuario.id)
    .eq("data_ocorrencia", data);

  const { error } = await (clienteId ? consulta.eq("cliente_id", clienteId) : consulta.is("cliente_id", null));

  if (error) {
    return NextResponse.json({ error: `Nao foi possivel reabrir a tarefa: ${error.message}` }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
