import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const [type, token] = authorization.split(" ");
  return type?.toLowerCase() === "bearer" ? token : "";
}

function createClients() {
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) return null;

  return {
    authClient: createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
    adminClient: createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
  };
}

async function authorize(request: Request) {
  const clients = createClients();
  if (!clients) {
    return {
      error: NextResponse.json(
        { error: "Supabase Auth do servidor nao esta configurado. Configure SUPABASE_SERVICE_ROLE_KEY no .env.local." },
        { status: 500 }
      ),
    };
  }

  const token = getBearerToken(request);
  if (!token) {
    return { error: NextResponse.json({ error: "Sessao nao encontrada. Entre novamente no sistema." }, { status: 401 }) };
  }

  const {
    data: { user },
    error: authError,
  } = await clients.authClient.auth.getUser(token);

  if (authError || !user?.email) {
    return { error: NextResponse.json({ error: "Sessao invalida. Entre novamente no sistema." }, { status: 401 }) };
  }

  const { data: caller, error: callerError } = await clients.adminClient
    .from("usuarios_sistema")
    .select("id,email,perfil,status")
    .ilike("email", user.email)
    .maybeSingle();

  if (callerError) {
    return { error: NextResponse.json({ error: `Nao foi possivel validar o usuario logado: ${callerError.message}` }, { status: 500 }) };
  }

  const isAllowed = caller && normalize(caller.status) !== "inativo" && ["administrador", "gestor"].includes(normalize(caller.perfil));
  if (!isAllowed) {
    return { error: NextResponse.json({ error: "Apenas usuarios ativos com perfil Administrador ou Gestor podem acessar obrigacoes." }, { status: 403 }) };
  }

  return { adminClient: clients.adminClient };
}

export async function GET(request: Request) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (id) {
    const { data, error } = await auth.adminClient
      .from("obrigacoes")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      return NextResponse.json({ error: `Erro ao buscar obrigacao: ${error.message}` }, { status: 404 });
    }

    return NextResponse.json({ obrigacao: data });
  }

  const { data, error } = await auth.adminClient
    .from("obrigacoes")
    .select("id,nome,validacao,regime,regimes,periodicidade,prazo,setor,status")
    .order("nome", { ascending: true });

  if (error) {
    return NextResponse.json({ error: `Erro ao buscar obrigacoes: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ obrigacoes: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;

  const payload = await request.json();
  const { error } = await auth.adminClient.from("obrigacoes").insert(payload);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;

  const body = await request.json();
  const id = typeof body.id === "string" ? body.id : "";
  const payload = body.payload;

  if (!id || !payload) {
    return NextResponse.json({ error: "Informe a obrigacao e os dados para atualizar." }, { status: 400 });
  }

  const { error } = await auth.adminClient.from("obrigacoes").update(payload).eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Informe a obrigacao para excluir." }, { status: 400 });
  }

  const { error } = await auth.adminClient.from("obrigacoes").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: `Erro ao excluir obrigacao: ${error.message}` }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
