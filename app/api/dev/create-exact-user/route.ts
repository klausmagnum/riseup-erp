import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Não permitido em produção" }, { status: 403 });
  }

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return NextResponse.json({ error: "Supabase não configurado" }, { status: 500 });
  }

  const { email, senha, nome } = await request.json();

  if (!email || !senha || !nome) {
    return NextResponse.json({ error: "Email, senha e nome são obrigatórios" }, { status: 400 });
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Deleta usuário existente com esse email (se houver)
  const { data: existingUsers } = await adminClient.auth.admin.listUsers();
  const existingUser = existingUsers?.users.find(u => u.email === email);
  if (existingUser) {
    await adminClient.auth.admin.deleteUser(existingUser.id);
  }

  // Cria usuário no Supabase Auth com a senha exata
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });

  if (authError) {
    return NextResponse.json({ error: `Auth error: ${authError.message}` }, { status: 400 });
  }

  // Deleta usuário local existente com esse email (se houver)
  await adminClient
    .from("usuarios_sistema")
    .delete()
    .eq("email", email);

  // Cria usuário na tabela usuarios_sistema
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
    await adminClient.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json({ error: `DB error: ${dbError.message}` }, { status: 400 });
  }

  return NextResponse.json({
    message: "Usuário criado com sucesso!",
    usuario: {
      email: usuarioData.email,
      nome: usuarioData.nome,
      perfil: usuarioData.perfil,
    },
  });
}
