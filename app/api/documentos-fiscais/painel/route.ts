import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Certificado vencido pega o escritório de surpresa e para a captura do
 *  cliente sem aviso. Trinta dias dá tempo de renovar com folga. */
const DIAS_ALERTA_VENCIMENTO = 30;

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const [type, token] = authorization.split(" ");
  return type?.toLowerCase() === "bearer" ? token : "";
}

async function authorize(request: Request) {
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return { error: NextResponse.json({ error: "Supabase nao configurado" }, { status: 500 }) };
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const token = getBearerToken(request);
  if (!token) {
    return { error: NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 }) };
  }

  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser(token);

  if (authError || !user?.email) {
    return { error: NextResponse.json({ error: "Sessao invalida." }, { status: 401 }) };
  }

  const { data: usuario } = await adminClient
    .from("usuarios_sistema")
    .select("id,status")
    .ilike("email", user.email)
    .maybeSingle();

  if (!usuario || (usuario.status ?? "").toLowerCase() === "inativo") {
    return { error: NextResponse.json({ error: "Usuario inativo." }, { status: 403 }) };
  }

  return { adminClient };
}

export async function GET(request: Request) {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;

  const { adminClient } = auth;

  const hoje = new Date();

  // Conta pela data de captura, não pela de emissão: a pergunta que o painel
  // responde é "a automação está rodando?". Uma nota emitida em maio pode
  // chegar hoje, e um mês sem emissão não significa que algo quebrou.
  const seteDiasAtras = new Date(hoje.getTime() - 7 * 86400000).toISOString();

  const limiteVencimento = new Date(hoje.getTime() + DIAS_ALERTA_VENCIMENTO * 86400000)
    .toISOString()
    .slice(0, 10);

  // Versões substituídas ficam de fora de toda contagem: são a mesma nota.
  const naoSubstituido = "status_processamento.is.null,status_processamento.neq.Substituido";

  const [
    documentosRecentes,
    documentosTotal,
    pendencias,
    clientesAtivos,
    clientesComCertificado,
    certificadosVencendo,
    sincronizacoes,
    clientesComErro,
  ] = await Promise.all([
    adminClient
      .from("documentos_fiscais")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .or(naoSubstituido)
      .gte("created_at", seteDiasAtras),

    adminClient
      .from("documentos_fiscais")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .or(naoSubstituido),

    adminClient
      .from("documentos_fiscais_pendencias")
      .select("id", { count: "exact", head: true })
      .eq("status", "ABERTA"),

    adminClient
      .from("clientes")
      .select("id", { count: "exact", head: true })
      .eq("status", "Ativo"),

    adminClient
      .from("cliente_certificados")
      .select("cliente_id")
      .eq("ativo", true)
      .is("deleted_at", null),

    adminClient
      .from("cliente_certificados")
      .select("id,nome,cliente_id,data_validade")
      .eq("ativo", true)
      .is("deleted_at", null)
      .not("data_validade", "is", null)
      .lte("data_validade", limiteVencimento)
      .order("data_validade"),

    adminClient
      .from("documentos_fiscais_sincronizacoes")
      .select("id,cliente_id,tipo_documento,status,data_inicio,data_fim,quantidade_encontrada,quantidade_importada,quantidade_erro,mensagem")
      .order("created_at", { ascending: false })
      .limit(15),

    adminClient
      .from("clientes")
      .select("id", { count: "exact", head: true })
      .eq("status", "Ativo")
      .eq("ultima_sincronizacao_nfe_status", "Erro"),
  ]);

  const comCertificado = new Set(
    (clientesComCertificado.data ?? []).map((c: { cliente_id: string }) => c.cliente_id)
  );

  // Nomes de cliente para as tabelas, numa consulta só.
  const idsParaNomear = [
    ...new Set([
      ...(sincronizacoes.data ?? []).map((s: { cliente_id: string | null }) => s.cliente_id),
      ...(certificadosVencendo.data ?? []).map((c: { cliente_id: string }) => c.cliente_id),
    ]),
  ].filter(Boolean) as string[];

  const nomes: Record<string, string> = {};
  if (idsParaNomear.length > 0) {
    const { data } = await adminClient
      .from("clientes")
      .select("id,razao_social")
      .in("id", idsParaNomear);
    for (const c of data ?? []) nomes[c.id] = c.razao_social;
  }

  const totalClientes = clientesAtivos.count ?? 0;
  const cobertos = comCertificado.size;

  return NextResponse.json({
    indicadores: {
      documentosRecentes: documentosRecentes.count ?? 0,
      documentosTotal: documentosTotal.count ?? 0,
      pendenciasAbertas: pendencias.count ?? 0,
      clientesAtivos: totalClientes,
      clientesComCertificado: cobertos,
      clientesSemCertificado: Math.max(0, totalClientes - cobertos),
      clientesComErro: clientesComErro.count ?? 0,
      certificadosVencendo: certificadosVencendo.data?.length ?? 0,
    },
    certificadosVencendo: (certificadosVencendo.data ?? []).map((c) => ({
      ...c,
      cliente_nome: nomes[c.cliente_id] ?? "",
      dias: Math.ceil((new Date(c.data_validade).getTime() - Date.now()) / 86400000),
    })),
    sincronizacoes: (sincronizacoes.data ?? []).map((s) => ({
      ...s,
      cliente_nome: s.cliente_id ? (nomes[s.cliente_id] ?? "") : "",
    })),
  });
}
