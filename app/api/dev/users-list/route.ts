import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return NextResponse.json({ error: "Supabase não configurado" }, { status: 500 });
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Lista usuários da tabela
  const { data: usuarios, error: dbError } = await adminClient
    .from("usuarios_sistema")
    .select("*");

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  // Lista usuários do Auth
  const { data: authUsers, error: authError } = await adminClient.auth.admin.listUsers();

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  return NextResponse.json({
    usuarios_sistema: usuarios,
    auth_users: authUsers.users.map(u => ({ id: u.id, email: u.email }))
  });
}
