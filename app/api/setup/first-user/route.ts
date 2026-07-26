import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(request: NextRequest) {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return NextResponse.json(
      { error: "Supabase não configurado" },
      { status: 500 }
    );
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Verifica se já existe algum usuário no sistema
  const { count, error: countError } = await adminClient
    .from("usuarios_sistema")
    .select("id", { count: "exact", head: true });

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "O sistema já possui usuários. Use a API de criação de usuários normal." },
      { status: 403 }
    );
  }

  const { email, senha, nome } = await request.json().catch(() => ({} as { email?: string; senha?: string; nome?: string }));

  if (!email || !senha || !nome) {
    return NextResponse.json(
      { error: "Email, senha e nome são obrigatórios" },
      { status: 400 }
    );
  }

  // Cria usuário no Supabase Auth
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });

  if (authError) {
    return NextResponse.json({ error: `Auth error: ${authError.message}` }, { status: 400 });
  }

  // Cria usuário na tabela usuarios_sistema com perfil Administrador
  const { data: usuarioData, error: dbError } = await adminClient
    .from("usuarios_sistema")
    .insert({
      email,
      nome,
      setor: "Administração",
      perfil: "Administrador",
      status: "Ativo",
    })
    .select()
    .single();

  if (dbError) {
    // Rollback: deleta o usuário criado no Auth
    await adminClient.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json({ error: `DB error: ${dbError.message}` }, { status: 400 });
  }

  return NextResponse.json({
    message: "Usuário administrativo criado com sucesso!",
    usuario: {
      id: usuarioData.id,
      email: usuarioData.email,
      nome: usuarioData.nome,
      perfil: usuarioData.perfil,
    },
  });
}
