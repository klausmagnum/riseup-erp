import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Autorizacao das rotas de API que falam com o banco.
 *
 * O browser nao le mais as tabelas do ERP direto: o RLS so libera leitura para
 * quem passa por aqui, e a escrita nao e liberada para ninguem alem da service
 * role. Toda rota que toca dado de cliente precisa validar o token da sessao
 * com este helper antes de usar o adminClient.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const perfisDeGestao = ["administrador", "gestor"];

export type UsuarioAutorizado = {
  id: string;
  email: string;
  perfil: string;
  status: string;
};

type Autorizacao =
  | { erro: NextResponse; adminClient?: undefined; usuario?: undefined }
  | { erro?: undefined; adminClient: SupabaseClient; usuario: UsuarioAutorizado };

function normalizar(valor: string | null | undefined) {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function lerTokenBearer(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const [tipo, token] = authorization.split(" ");
  return tipo?.toLowerCase() === "bearer" ? token : "";
}

function criarClients() {
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

export function exigeGestao(usuario: UsuarioAutorizado) {
  return perfisDeGestao.includes(normalizar(usuario.perfil));
}

/**
 * Valida a sessao e devolve o cliente com service role.
 *
 * `recurso` entra na mensagem de 403 ("...podem alterar clientes"), e
 * `apenasGestao` restringe a Administrador e Gestor — use nas escritas de
 * cadastro. Leitura costuma valer para qualquer usuario ativo, senao Operador e
 * Consulta perdem telas que hoje funcionam.
 */
export async function autorizar(
  request: Request,
  { recurso, apenasGestao = false }: { recurso: string; apenasGestao?: boolean }
): Promise<Autorizacao> {
  const clients = criarClients();
  if (!clients) {
    return {
      erro: NextResponse.json(
        { error: "Supabase do servidor nao esta configurado. Confira SUPABASE_SERVICE_ROLE_KEY nas variaveis de ambiente." },
        { status: 500 }
      ),
    };
  }

  const token = lerTokenBearer(request);
  if (!token) {
    return { erro: NextResponse.json({ error: "Sessao nao encontrada. Entre novamente no sistema." }, { status: 401 }) };
  }

  const {
    data: { user },
    error: authError,
  } = await clients.authClient.auth.getUser(token);

  if (authError || !user?.email) {
    return { erro: NextResponse.json({ error: "Sessao invalida. Entre novamente no sistema." }, { status: 401 }) };
  }

  const { data: cadastro, error: cadastroError } = await clients.adminClient
    .from("usuarios_sistema")
    .select("id,email,perfil,status")
    .ilike("email", user.email)
    .maybeSingle();

  if (cadastroError) {
    return {
      erro: NextResponse.json({ error: `Nao foi possivel validar o usuario logado: ${cadastroError.message}` }, { status: 500 }),
    };
  }

  if (!cadastro || normalizar(cadastro.status) === "inativo") {
    return {
      erro: NextResponse.json({ error: "Usuario sem acesso ativo ao ERP. Fale com o administrador." }, { status: 403 }),
    };
  }

  const usuario = cadastro as UsuarioAutorizado;

  if (apenasGestao && !exigeGestao(usuario)) {
    return {
      erro: NextResponse.json(
        { error: `Apenas usuarios com perfil Administrador ou Gestor podem alterar ${recurso}.` },
        { status: 403 }
      ),
    };
  }

  return { adminClient: clients.adminClient, usuario };
}
