import { NextResponse } from "next/server";
import { autorizar } from "@/app/lib/apiAuth";

/**
 * Leitura e escrita de clientes.
 *
 * Existe porque as telas liam public.clientes direto do browser, e fechar essa
 * leitura no RLS exigia um lugar unico no servidor por onde tudo passa. Ler vale
 * para qualquer usuario ativo — documentos fiscais, tarefas e os paineis
 * dependem da lista —, mas criar, alterar e excluir e restrito a gestao.
 */

// Colunas da listagem: uniao do que as telas de lista, os modais de captura e os
// seletores de cliente precisam. O cadastro completo vem por ?id=.
const colunasLista =
  "id,razao_social,nome_fantasia,tipo,matriz_filial,identificacao,regime_tributario,grupo_clientes,municipio,estado,email,contato,status";

const colunasCadastro =
  "id,razao_social,data_abertura,nome_fantasia,tipo,matriz_filial,identificacao,inscricao_estadual,inscricao_municipal,cei,cep,logradouro,regime_tributario,numero,complemento,grupo_clientes,bairro,estado,municipio,email,contato,data_inicio_controle_obrigacoes,observacao,obrigacoes_vinculadas,status";

export async function GET(request: Request) {
  const auth = await autorizar(request, { recurso: "clientes" });
  if (auth.erro) return auth.erro;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const status = searchParams.get("status");

  if (id) {
    const { data, error } = await auth.adminClient.from("clientes").select(colunasCadastro).eq("id", id).maybeSingle();

    if (error) {
      return NextResponse.json({ error: `Erro ao buscar cliente: ${error.message}` }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Cliente nao encontrado." }, { status: 404 });
    }

    return NextResponse.json({ cliente: data });
  }

  let query = auth.adminClient.from("clientes").select(colunasLista).order("razao_social", { ascending: true });

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: `Erro ao buscar clientes: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ clientes: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await autorizar(request, { recurso: "clientes", apenasGestao: true });
  if (auth.erro) return auth.erro;

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Informe os dados do cliente." }, { status: 400 });
  }

  const { data, error } = await auth.adminClient.from("clientes").insert(payload).select("id").single();

  if (error) {
    return NextResponse.json({ error: `Erro ao salvar cliente: ${error.message}` }, { status: 400 });
  }

  return NextResponse.json({ cliente: data });
}

export async function PATCH(request: Request) {
  const auth = await autorizar(request, { recurso: "clientes", apenasGestao: true });
  if (auth.erro) return auth.erro;

  const body = await request.json().catch(() => null);
  const id = body && typeof body.id === "string" ? body.id : "";
  const payload = body?.payload;

  if (!id || !payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Informe o cliente e os dados para atualizar." }, { status: 400 });
  }

  const { data, error } = await auth.adminClient.from("clientes").update(payload).eq("id", id).select("id").single();

  if (error) {
    return NextResponse.json({ error: `Erro ao atualizar cliente: ${error.message}` }, { status: 400 });
  }

  return NextResponse.json({ cliente: data });
}

export async function DELETE(request: Request) {
  const auth = await autorizar(request, { recurso: "clientes", apenasGestao: true });
  if (auth.erro) return auth.erro;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Informe o cliente para excluir." }, { status: 400 });
  }

  const { error } = await auth.adminClient.from("clientes").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: `Erro ao excluir cliente: ${error.message}` }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
