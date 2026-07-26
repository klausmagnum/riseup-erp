import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// APENAS PARA DESENVOLVIMENTO - REMOVER EM PRODUÇÃO
export async function DELETE(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Não permitido em produção" }, { status: 403 });
  }

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return NextResponse.json({ error: "Supabase não configurado" }, { status: 500 });
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Deleta todos os usuários da tabela
  const { error: dbError } = await adminClient.from("usuarios_sistema").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  if (dbError) {
    return NextResponse.json({ error: `Erro ao deletar usuários do banco: ${dbError.message}` }, { status: 500 });
  }

  // Deleta todos os usuários do Auth também
  const { data: users, error: listError } = await adminClient.auth.admin.listUsers();

  if (listError) {
    return NextResponse.json({ error: `Erro ao listar usuários: ${listError.message}` }, { status: 500 });
  }

  for (const user of users.users) {
    await adminClient.auth.admin.deleteUser(user.id);
  }

  return NextResponse.json({ message: "Sistema resetado para desenvolvimento" });
}
