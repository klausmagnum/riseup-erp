import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const [type, token] = authorization.split(" ");
  return type?.toLowerCase() === "bearer" ? token : "";
}

/**
 * Histórico de sincronização. Sempre de um cliente — no painel isso aparece
 * dentro da linha dele, e não como lista geral: com a carteira inteira
 * sincronizando quatro vezes ao dia, uma lista global rolaria sem parar e não
 * responderia nada sobre um cliente específico.
 */
export async function GET(request: Request) {
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return NextResponse.json({ error: "Supabase nao configurado" }, { status: 500 });
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 });

  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser(token);

  if (authError || !user?.email) {
    return NextResponse.json({ error: "Sessao invalida." }, { status: 401 });
  }

  const { data: usuario } = await adminClient
    .from("usuarios_sistema")
    .select("id,status")
    .ilike("email", user.email)
    .maybeSingle();

  if (!usuario || (usuario.status ?? "").toLowerCase() === "inativo") {
    return NextResponse.json({ error: "Usuario inativo." }, { status: 403 });
  }

  const clienteId = new URL(request.url).searchParams.get("clienteId");
  if (!clienteId) {
    return NextResponse.json({ error: "clienteId e obrigatorio." }, { status: 400 });
  }

  const { data, error } = await adminClient
    .from("documentos_fiscais_sincronizacoes")
    .select(
      "id,tipo_documento,status,data_inicio,data_fim,quantidade_encontrada," +
        "quantidade_importada,quantidade_erro,mensagem"
    )
    .eq("cliente_id", clienteId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json(
      { error: `Nao foi possivel carregar o historico: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ sincronizacoes: data ?? [] });
}
