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

export async function POST(request: Request) {
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return NextResponse.json(
      { error: "Supabase Auth do servidor nao esta configurado. Configure SUPABASE_SERVICE_ROLE_KEY no .env.local." },
      { status: 500 }
    );
  }

  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Faca login como Administrador ou Gestor para cadastrar usuarios." }, { status: 401 });
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser(token);

  if (authError || !user?.email) {
    return NextResponse.json({ error: "Sessao invalida. Entre novamente no sistema." }, { status: 401 });
  }

  const { data: caller, error: callerError } = await adminClient
    .from("usuarios_sistema")
    .select("id,nome,email,perfil,status")
    .ilike("email", user.email)
    .maybeSingle();

  if (callerError) {
    return NextResponse.json({ error: `Nao foi possivel validar o usuario logado: ${callerError.message}` }, { status: 500 });
  }

  const callerPerfil = normalize(caller?.perfil);
  const callerStatus = normalize(caller?.status);
  const canCreateUser = callerStatus !== "inativo" && ["administrador", "gestor"].includes(callerPerfil);

  if (!caller || !canCreateUser) {
    return NextResponse.json({ error: "Apenas usuarios ativos com perfil Administrador ou Gestor podem cadastrar acessos." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({} as { email?: string; password?: string; nome?: string }));
  const email = body.email?.trim();
  const password = body.password?.trim();
  const nome = body.nome?.trim();

  if (!email || !password) {
    return NextResponse.json({ error: "Informe e-mail e senha temporaria." }, { status: 400 });
  }

  const { data: authUser, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: nome ? { nome } : undefined,
  });

  if (createError) {
    const message = createError.message.toLowerCase();
    if (message.includes("already") || message.includes("registered") || message.includes("exists")) {
      return NextResponse.json({ ok: true, alreadyExists: true });
    }

    return NextResponse.json({ error: createError.message }, { status: 400 });
  }

  // Insere o usuário na tabela usuarios_sistema
  const { error: dbError } = await adminClient
    .from("usuarios_sistema")
    .upsert({
      email,
      nome: nome || email,
      setor: "Geral",
      perfil: "Operador",
      status: "Ativo",
    }, { onConflict: "email" });

  if (dbError) {
    return NextResponse.json({ error: `Erro ao criar usuário no banco de dados: ${dbError.message}` }, { status: 400 });
  }

  return NextResponse.json({ ok: true, alreadyExists: false });
}
