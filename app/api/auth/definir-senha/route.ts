import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Troca a senha de um usuário do ERP, no Supabase Auth.
 *
 * A tela de Usuários tinha um botão "alterar senha" que só gravava a senha em
 * texto claro na coluna usuarios_sistema.senha_temporaria e nunca falava com o
 * Auth: quem clicava lia "Senha temporária alterada com sucesso" e a senha de
 * login do usuário continuava a mesma. O Auth é quem guarda a credencial de
 * verdade, então é nele que a troca tem de acontecer — e a senha não é
 * persistida em lugar nenhum além dele.
 */

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

/**
 * Acha o usuário do Auth pelo e-mail.
 *
 * O supabase-js não tem busca por e-mail no admin, só a listagem paginada, e
 * ela devolve 50 por página: sem percorrer as páginas, o escritório pararia de
 * conseguir trocar a senha do 51º usuário em diante, em silêncio.
 */
async function acharUsuarioDoAuth(adminClient: SupabaseClient, email: string) {
  const alvo = normalize(email);

  for (let page = 1; page <= 40; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);

    const achado = data.users.find((u) => normalize(u.email) === alvo);
    if (achado) return achado;
    if (data.users.length < 200) return null;
  }

  return null;
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
    return NextResponse.json({ error: "Faca login como Administrador ou Gestor para alterar senhas." }, { status: 401 });
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
    .select("id,email,perfil,status")
    .ilike("email", user.email)
    .maybeSingle();

  if (callerError) {
    return NextResponse.json({ error: `Nao foi possivel validar o usuario logado: ${callerError.message}` }, { status: 500 });
  }

  const podeAlterar =
    caller &&
    normalize(caller.status) !== "inativo" &&
    ["administrador", "gestor"].includes(normalize(caller.perfil));

  if (!podeAlterar) {
    return NextResponse.json(
      { error: "Apenas usuarios ativos com perfil Administrador ou Gestor podem alterar senhas." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({} as { id?: string; password?: string }));
  const id = body.id?.trim();
  const password = body.password ?? "";

  if (!id) {
    return NextResponse.json({ error: "Informe o usuario." }, { status: 400 });
  }

  // O Supabase recusa senha curta com mensagem própria, mas conferir aqui evita
  // criar expectativa de troca que o Auth vai rejeitar depois.
  if (password.length < 8) {
    return NextResponse.json({ error: "A senha precisa ter ao menos 8 caracteres." }, { status: 400 });
  }

  const { data: alvo, error: alvoError } = await adminClient
    .from("usuarios_sistema")
    .select("id,email,nome")
    .eq("id", id)
    .maybeSingle();

  if (alvoError) {
    return NextResponse.json({ error: `Nao foi possivel localizar o usuario: ${alvoError.message}` }, { status: 500 });
  }

  if (!alvo?.email) {
    return NextResponse.json({ error: "Usuario sem e-mail cadastrado; nao ha acesso no Auth para alterar." }, { status: 400 });
  }

  let usuarioDoAuth;
  try {
    usuarioDoAuth = await acharUsuarioDoAuth(adminClient, alvo.email);
  } catch (error) {
    return NextResponse.json(
      { error: `Nao foi possivel consultar o Supabase Auth: ${error instanceof Error ? error.message : error}` },
      { status: 500 }
    );
  }

  if (!usuarioDoAuth) {
    return NextResponse.json(
      { error: `Nao existe acesso no Supabase Auth para ${alvo.email}. Cadastre o acesso antes de trocar a senha.` },
      { status: 404 }
    );
  }

  const { error: updateError } = await adminClient.auth.admin.updateUserById(usuarioDoAuth.id, {
    password,
  });

  if (updateError) {
    return NextResponse.json({ error: `Nao foi possivel alterar a senha: ${updateError.message}` }, { status: 400 });
  }

  // A coluna antiga guardava a senha legível. Zerar aqui impede que um registro
  // trocado por esta rota deixe rastro em texto claro.
  await adminClient
    .from("usuarios_sistema")
    .update({ senha_temporaria: null, updated_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ ok: true });
}
