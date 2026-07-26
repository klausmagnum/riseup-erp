import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const [type, token] = authorization.split(" ");
  return type?.toLowerCase() === "bearer" ? token : "";
}

export async function GET(request: Request) {
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return NextResponse.json(
      { error: "Supabase Auth do servidor nao esta configurado. Configure SUPABASE_SERVICE_ROLE_KEY no .env.local." },
      { status: 500 }
    );
  }

  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Sessao nao encontrada. Entre novamente no sistema." }, { status: 401 });
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

  const { data: usuario, error: usuarioError } = await adminClient
    .from("usuarios_sistema")
    .select("id,nome,email,perfil,status")
    .ilike("email", user.email)
    .maybeSingle();

  if (usuarioError) {
    return NextResponse.json({ error: `Nao foi possivel buscar o usuario cadastrado: ${usuarioError.message}` }, { status: 500 });
  }

  if (!usuario) {
    // Se não existir, cria automaticamente (primeira vez que faz login)
    const { data: novoUsuario, error: criarError } = await adminClient
      .from("usuarios_sistema")
      .insert({
        email: user.email,
        nome: user.user_metadata?.full_name || user.email.split("@")[0],
        setor: "Geral",
        perfil: "Operador",
        status: "Ativo",
      })
      .select("id,nome,email,perfil,status")
      .single();

    if (criarError || !novoUsuario) {
      return NextResponse.json({
        error: `Nao foi possivel criar usuario: ${criarError?.message || "Desconhecido"}`
      }, { status: 500 });
    }

    return NextResponse.json({ usuario: novoUsuario });
  }

  if ((usuario.status ?? "").toLowerCase() === "inativo") {
    return NextResponse.json({ error: "Usuario inativo. Verifique o cadastro de usuarios." }, { status: 403 });
  }

  return NextResponse.json({ usuario });
}
