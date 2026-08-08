import { NextResponse } from "next/server";
import { autorizar } from "@/app/lib/apiAuth";
import {
  prioridadesTarefaPessoal,
  recorrenciasTarefaPessoal,
  tiposTarefaPessoal,
  type PrioridadeTarefaPessoal,
  type RecorrenciaTarefaPessoal,
  type TipoTarefaPessoal,
} from "@/app/lib/tarefasPessoais";

/**
 * Tarefas pessoais do My Desktop.
 *
 * Toda consulta e toda escrita levam `.eq("usuario_id", usuario.id)`: o dono
 * vem da sessao validada, nunca do corpo da requisicao. E o que garante que um
 * funcionario nao veja — nem altere — a tarefa de outro, mesmo mandando um id
 * alheio na mao.
 */

const camposDaTarefa = "id,titulo,descricao,tipo,recorrencia,data_inicio,prazo,prioridade,clientes_vinculados,regimes";

type LinhaDaTarefa = {
  id: string;
  clientes_vinculados: string[] | null;
  regimes: string[] | null;
};

type PayloadTarefa = {
  titulo: string;
  descricao: string | null;
  tipo: TipoTarefaPessoal;
  recorrencia: RecorrenciaTarefaPessoal;
  data_inicio: string;
  prazo: string;
  prioridade: PrioridadeTarefaPessoal;
  clientes_vinculados: string[];
  regimes: string[];
};

function ehDataIso(valor: unknown): valor is string {
  return typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor);
}

function lerListaDeTexto(valor: unknown) {
  if (!Array.isArray(valor)) return [];

  return Array.from(
    new Set(
      valor
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

/** A tarefa sai do banco com os nomes das colunas; a tela usa os nomes curtos. */
function montarTarefa(linha: LinhaDaTarefa, conclusoes: Array<{ data: string; clienteId: string | null }>) {
  const { clientes_vinculados, regimes, ...resto } = linha;

  return {
    ...resto,
    clientes: clientes_vinculados ?? [],
    regimes: regimes ?? [],
    conclusoes,
  };
}

function lerPayload(corpo: unknown): { payload: PayloadTarefa } | { erro: string } {
  const dados = (corpo ?? {}) as Record<string, unknown>;
  const titulo = typeof dados.titulo === "string" ? dados.titulo.trim() : "";
  const prazo = dados.prazo;
  const tipo = typeof dados.tipo === "string" ? dados.tipo : "";
  const recorrencia = typeof dados.recorrencia === "string" ? dados.recorrencia : "";
  const prioridade = typeof dados.prioridade === "string" ? dados.prioridade : "Media";
  const descricao = typeof dados.descricao === "string" ? dados.descricao.trim() : "";

  if (!titulo) return { erro: "Informe o nome da tarefa." };
  if (!ehDataIso(prazo)) return { erro: "Informe a data da tarefa." };
  if (!tiposTarefaPessoal.includes(tipo as TipoTarefaPessoal)) return { erro: "Tipo de tarefa invalido." };
  if (!recorrenciasTarefaPessoal.includes(recorrencia as RecorrenciaTarefaPessoal)) {
    return { erro: "Recorrencia invalida." };
  }
  if (!prioridadesTarefaPessoal.includes(prioridade as PrioridadeTarefaPessoal)) {
    return { erro: "Prioridade invalida." };
  }

  return {
    payload: {
      titulo,
      descricao: descricao || null,
      tipo: tipo as TipoTarefaPessoal,
      recorrencia: recorrencia as RecorrenciaTarefaPessoal,
      // A tela pede uma data so. O inicio do controle acompanha essa data, que
      // e tambem quem define o dia da recorrencia.
      data_inicio: prazo,
      prazo,
      prioridade: prioridade as PrioridadeTarefaPessoal,
      // Regime entra como regime, nao expandido em clientes: cliente novo do
      // regime passa a valer para a tarefa sem ninguem reeditar nada.
      clientes_vinculados: lerListaDeTexto(dados.clientes),
      regimes: lerListaDeTexto(dados.regimes),
    },
  };
}

export async function GET(request: Request) {
  const auth = await autorizar(request, { recurso: "tarefas pessoais" });
  if (auth.erro) return auth.erro;

  const [
    { data: tarefas, error: tarefasError },
    { data: conclusoes, error: conclusoesError },
    { data: clientes, error: clientesError },
  ] = await Promise.all([
    auth.adminClient
      .from("tarefas_pessoais")
      .select(camposDaTarefa)
      .eq("usuario_id", auth.usuario.id)
      .order("prazo", { ascending: true }),
    auth.adminClient
      .from("tarefas_pessoais_conclusoes")
      .select("tarefa_id,data_ocorrencia,cliente_id")
      .eq("usuario_id", auth.usuario.id),
    // A tela precisa dos clientes para montar o seletor e para resolver os
    // regimes; o cadastro de clientes ja e visivel a qualquer usuario ativo.
    auth.adminClient
      .from("clientes")
      .select("id,razao_social,nome_fantasia,identificacao,regime_tributario,status")
      .order("razao_social", { ascending: true }),
  ]);

  if (tarefasError) {
    return NextResponse.json({ error: `Nao foi possivel carregar suas tarefas: ${tarefasError.message}` }, { status: 500 });
  }

  if (conclusoesError) {
    return NextResponse.json(
      { error: `Nao foi possivel carregar as conclusoes das suas tarefas: ${conclusoesError.message}` },
      { status: 500 }
    );
  }

  if (clientesError) {
    return NextResponse.json({ error: `Nao foi possivel carregar os clientes: ${clientesError.message}` }, { status: 500 });
  }

  const concluidasPorTarefa = (conclusoes ?? []).reduce<Record<string, Array<{ data: string; clienteId: string | null }>>>(
    (mapa, conclusao) => {
      const lista = mapa[conclusao.tarefa_id] ?? [];
      lista.push({ data: String(conclusao.data_ocorrencia).slice(0, 10), clienteId: conclusao.cliente_id ?? null });
      mapa[conclusao.tarefa_id] = lista;
      return mapa;
    },
    {}
  );

  return NextResponse.json({
    tarefas: (tarefas ?? []).map((tarefa) => montarTarefa(tarefa, concluidasPorTarefa[tarefa.id] ?? [])),
    clientes: clientes ?? [],
  });
}

export async function POST(request: Request) {
  const auth = await autorizar(request, { recurso: "tarefas pessoais" });
  if (auth.erro) return auth.erro;

  const corpo = await request.json().catch(() => null);
  const leitura = lerPayload(corpo);
  if ("erro" in leitura) return NextResponse.json({ error: leitura.erro }, { status: 400 });

  const { data, error } = await auth.adminClient
    .from("tarefas_pessoais")
    .insert({ ...leitura.payload, usuario_id: auth.usuario.id })
    .select(camposDaTarefa)
    .single();

  if (error) {
    return NextResponse.json({ error: `Nao foi possivel salvar a tarefa: ${error.message}` }, { status: 400 });
  }

  return NextResponse.json({ tarefa: montarTarefa(data, []) });
}

export async function PATCH(request: Request) {
  const auth = await autorizar(request, { recurso: "tarefas pessoais" });
  if (auth.erro) return auth.erro;

  const corpo = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof corpo.id === "string" ? corpo.id : "";

  if (!id) return NextResponse.json({ error: "Informe a tarefa que voce quer alterar." }, { status: 400 });

  const leitura = lerPayload(corpo.payload);
  if ("erro" in leitura) return NextResponse.json({ error: leitura.erro }, { status: 400 });

  const { data, error } = await auth.adminClient
    .from("tarefas_pessoais")
    .update({ ...leitura.payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("usuario_id", auth.usuario.id)
    .select(camposDaTarefa)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: `Nao foi possivel atualizar a tarefa: ${error.message}` }, { status: 400 });
  }

  if (!data) {
    return NextResponse.json({ error: "Tarefa nao encontrada entre as suas tarefas." }, { status: 404 });
  }

  return NextResponse.json({ tarefa: montarTarefa(data, []) });
}

export async function DELETE(request: Request) {
  const auth = await autorizar(request, { recurso: "tarefas pessoais" });
  if (auth.erro) return auth.erro;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "Informe a tarefa que voce quer excluir." }, { status: 400 });

  const { data, error } = await auth.adminClient
    .from("tarefas_pessoais")
    .delete()
    .eq("id", id)
    .eq("usuario_id", auth.usuario.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: `Nao foi possivel excluir a tarefa: ${error.message}` }, { status: 400 });
  }

  if (!data) {
    return NextResponse.json({ error: "Tarefa nao encontrada entre as suas tarefas." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
