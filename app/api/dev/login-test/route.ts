import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// APENAS PARA DESENVOLVIMENTO. Sem a guarda, esta rota e um oraculo de login
// aberto: aceita e-mail e senha de qualquer origem e devolve o erro completo do
// Supabase, que distingue senha errada de usuario inexistente.
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Não permitido em produção" }, { status: 403 });
  }

  const { email, password } = await request.json();

  const supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return NextResponse.json({
      error: error.message,
      status: error.status,
      fullError: error
    }, { status: 400 });
  }

  return NextResponse.json({ success: true, user: data.user.email });
}
