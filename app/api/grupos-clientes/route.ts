import { NextResponse } from "next/server";
import { autorizar } from "@/app/lib/apiAuth";

/**
 * Grupos de clientes.
 *
 * O vinculo entre grupo e cliente nao vive numa tabela de ligacao: e a coluna
 * clientes.grupo_clientes, gravada com o nome do grupo. Por isso salvar ou
 * excluir um grupo sempre mexe em duas tabelas, e as duas escritas ficam aqui —
 * na tela elas eram duas chamadas soltas do browser, que podiam falhar pela
 * metade e deixar cliente apontando para grupo que nao existe mais.
 */

const colunas = "id,nome,responsavel,descricao,clientes,status";

const gruposIniciais = [
  {
    nome: "Clientes recorrentes",
    responsavel: "Equipe Atendimento",
    clientes: 0,
    status: "Ativo",
    descricao: "Clientes com rotinas mensais e acompanhamento permanente.",
  },
  {
    nome: "Projetos pontuais",
    responsavel: "Equipe Comercial",
    clientes: 0,
    status: "Ativo",
    descricao: "Clientes vinculados a demandas avulsas, implantacoes ou consultorias.",
  },
];

type AdminClient = NonNullable<Awaited<ReturnType<typeof autorizar>>["adminClient"]>;

async function revincularClientes(
  adminClient: AdminClient,
  { nome, nomeAnterior, clienteIds }: { nome: string | null; nomeAnterior?: string | null; clienteIds?: string[] }
) {
  if (nomeAnterior) {
    const { error } = await adminClient.from("clientes").update({ grupo_clientes: null }).eq("grupo_clientes", nomeAnterior);
    if (error) return `Erro ao limpar empresas vinculadas: ${error.message}`;
  }

  if (nome && clienteIds && clienteIds.length > 0) {
    const { error } = await adminClient.from("clientes").update({ grupo_clientes: nome }).in("id", clienteIds);
    if (error) return `Erro ao vincular empresas: ${error.message}`;
  }

  return "";
}

export async function GET(request: Request) {
  const auth = await autorizar(request, { recurso: "grupos de clientes" });
  if (auth.erro) return auth.erro;

  const { data, error } = await auth.adminClient.from("grupos_clientes").select(colunas).order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: `Erro ao buscar grupos de clientes: ${error.message}` }, { status: 500 });
  }

  if (data && data.length > 0) {
    return NextResponse.json({ grupos: data });
  }

  const { data: semeados, error: seedError } = await auth.adminClient.from("grupos_clientes").insert(gruposIniciais).select(colunas);

  if (seedError) {
    return NextResponse.json({ error: `Erro ao criar grupos iniciais: ${seedError.message}` }, { status: 400 });
  }

  return NextResponse.json({ grupos: semeados ?? [] });
}

export async function POST(request: Request) {
  const auth = await autorizar(request, { recurso: "grupos de clientes", apenasGestao: true });
  if (auth.erro) return auth.erro;

  const body = await request.json().catch(() => null);
  const payload = body?.payload;
  const clienteIds: string[] = Array.isArray(body?.clienteIds) ? body.clienteIds : [];

  if (!payload || typeof payload !== "object" || typeof payload.nome !== "string" || !payload.nome.trim()) {
    return NextResponse.json({ error: "Informe o nome do grupo." }, { status: 400 });
  }

  const { data, error } = await auth.adminClient
    .from("grupos_clientes")
    .insert({ ...payload, status: "Ativo" })
    .select(colunas)
    .single();

  if (error) {
    return NextResponse.json({ error: `Erro ao salvar grupo: ${error.message}` }, { status: 400 });
  }

  const erroVinculo = await revincularClientes(auth.adminClient, { nome: payload.nome, clienteIds });
  if (erroVinculo) {
    return NextResponse.json({ error: erroVinculo, grupo: data }, { status: 400 });
  }

  return NextResponse.json({ grupo: data });
}

export async function PATCH(request: Request) {
  const auth = await autorizar(request, { recurso: "grupos de clientes", apenasGestao: true });
  if (auth.erro) return auth.erro;

  const body = await request.json().catch(() => null);
  const id = body && typeof body.id === "string" ? body.id : "";
  const payload = body?.payload;
  const clienteIds: string[] = Array.isArray(body?.clienteIds) ? body.clienteIds : [];
  const nomeAnterior = typeof body?.nomeAnterior === "string" ? body.nomeAnterior : null;

  if (!id || !payload || typeof payload !== "object" || typeof payload.nome !== "string" || !payload.nome.trim()) {
    return NextResponse.json({ error: "Informe o grupo e o nome para atualizar." }, { status: 400 });
  }

  const { data, error } = await auth.adminClient.from("grupos_clientes").update(payload).eq("id", id).select(colunas).single();

  if (error) {
    return NextResponse.json({ error: `Erro ao atualizar grupo: ${error.message}` }, { status: 400 });
  }

  const erroVinculo = await revincularClientes(auth.adminClient, { nome: payload.nome, nomeAnterior, clienteIds });
  if (erroVinculo) {
    return NextResponse.json({ error: erroVinculo, grupo: data }, { status: 400 });
  }

  return NextResponse.json({ grupo: data });
}

export async function DELETE(request: Request) {
  const auth = await autorizar(request, { recurso: "grupos de clientes", apenasGestao: true });
  if (auth.erro) return auth.erro;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const nome = searchParams.get("nome");

  if (!id) {
    return NextResponse.json({ error: "Informe o grupo para excluir." }, { status: 400 });
  }

  // Solta os clientes antes de apagar o grupo: na ordem inversa, uma falha aqui
  // deixaria clientes apontando para um grupo que nao existe mais.
  const erroVinculo = await revincularClientes(auth.adminClient, { nome: null, nomeAnterior: nome });
  if (erroVinculo) {
    return NextResponse.json({ error: erroVinculo }, { status: 400 });
  }

  const { error } = await auth.adminClient.from("grupos_clientes").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: `Erro ao excluir grupo: ${error.message}` }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
