import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  sincronizarClienteNFe,
  type ClienteSincronizavel,
} from "@/app/lib/sefaz/sincronizarCliente";
import type { RegistroCertificado } from "@/app/lib/sefaz/certificado";

// O certificado A1 exige mTLS via módulo https do Node — não roda no runtime Edge.
export const runtime = "nodejs";
export const maxDuration = 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const [type, token] = authorization.split(" ");
  return type?.toLowerCase() === "bearer" ? token : "";
}

function createClients() {
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

async function authorize(request: Request) {
  const clients = createClients();
  if (!clients) {
    return { error: NextResponse.json({ error: "Supabase nao configurado" }, { status: 500 }) };
  }

  const token = getBearerToken(request);
  if (!token) {
    return { error: NextResponse.json({ error: "Token nao fornecido" }, { status: 401 }) };
  }

  const {
    data: { user },
    error: authError,
  } = await clients.authClient.auth.getUser(token);

  if (authError || !user?.email) {
    return { error: NextResponse.json({ error: "Token invalido" }, { status: 401 }) };
  }

  const { data: usuario, error: usuarioError } = await clients.adminClient
    .from("usuarios_sistema")
    .select("*")
    .ilike("email", user.email)
    .maybeSingle();

  if (usuarioError || !usuario) {
    return { error: NextResponse.json({ error: "Usuario nao encontrado" }, { status: 401 }) };
  }

  return { adminClient: clients.adminClient, usuario };
}

function podeSincronizar(usuario: Record<string, any>) {
  const perfil = (usuario.perfil ?? "").toLowerCase();
  if (["administrador", "gestor"].includes(perfil)) return true;
  return Boolean(usuario.permissoes?.["documentos_fiscais.sincronizar"]);
}

export async function POST(request: Request) {
  const inicio = Date.now();
  const authResult = await authorize(request);
  if ("error" in authResult) return authResult.error;

  const { adminClient, usuario } = authResult;

  if (!podeSincronizar(usuario)) {
    return NextResponse.json(
      { error: "Permissao insuficiente para sincronizar NF-es" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const clienteId = body.clienteId as string | undefined;
  const certificadoId = body.certificadoId as string | undefined;
  const ambiente = body.ambiente === "producao" ? "producao" : "homologacao";

  if (!clienteId) {
    return NextResponse.json({ error: "clienteId e obrigatorio" }, { status: 400 });
  }

  const { data: cliente, error: clienteError } = await adminClient
    .from("clientes")
    .select("id,razao_social,identificacao,estado,ultimo_nsu_nfe_recebida")
    .eq("id", clienteId)
    .maybeSingle<ClienteSincronizavel>();

  if (clienteError || !cliente) {
    return NextResponse.json({ error: "Cliente nao encontrado" }, { status: 404 });
  }

  // Sem certificado explícito, usa o principal ativo do cliente.
  const consulta = adminClient
    .from("cliente_certificados")
    .select("id,cliente_id,nome,drive_file_id,senha_criptografada,data_validade,ativo")
    .eq("cliente_id", clienteId)
    .eq("ativo", true)
    .is("deleted_at", null);

  const { data: certificado, error: certificadoError } = certificadoId
    ? await consulta.eq("id", certificadoId).maybeSingle<RegistroCertificado>()
    : await consulta
        .order("principal", { ascending: false })
        .limit(1)
        .maybeSingle<RegistroCertificado>();

  if (certificadoError || !certificado) {
    return NextResponse.json(
      { error: "Nenhum certificado ativo encontrado para este cliente" },
      { status: 404 }
    );
  }

  const { data: execucao } = await adminClient
    .from("documentos_fiscais_sincronizacoes")
    .insert({
      cliente_id: cliente.id,
      tipo_documento: "NFe",
      certificado_id: certificado.id,
      status: "Executando",
      data_inicio: new Date().toISOString(),
    })
    .select("id")
    .single();

  const resultado = await sincronizarClienteNFe({
    supabase: adminClient,
    cliente,
    certificado,
    ambiente,
    // Margem para gravar o resultado antes de a função ser cortada.
    deadline: inicio + 50_000,
  });

  if (execucao) {
    await adminClient
      .from("documentos_fiscais_sincronizacoes")
      .update({
        status: resultado.status,
        data_fim: new Date().toISOString(),
        quantidade_encontrada: resultado.encontrados,
        quantidade_importada: resultado.importados,
        quantidade_erro: resultado.erros,
        mensagem: resultado.mensagem,
      })
      .eq("id", execucao.id);
  }

  const houveFalha = resultado.status === "Erro";

  return NextResponse.json(
    {
      ok: !houveFalha,
      ...resultado,
      mensagem: resultado.mensagem,
    },
    { status: houveFalha ? 502 : 200 }
  );
}
