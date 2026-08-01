import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Uma linha da visão: um dia de emissão de uma família/direção/situação. */
interface LinhaVisao {
  cliente_id: string;
  familia: string;
  direcao: string;
  situacao: string;
  data_emissao: string | null;
  quantidade: number;
}

/** O bloco máximo que o PostgREST devolve por requisição. */
const TAMANHO_BLOCO = 1000;

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

/**
 * Quantos documentos existem de cada família, direção e situação.
 *
 * Alimenta os quadros da tela do cliente. A contagem vem pronta da visão
 * painel_fiscal_documentos_por_tipo, e não de uma consulta por quadro.
 *
 * Aceita `de` e `ate` (data de emissão) para que o período escolhido na tela
 * valha tanto para o número do quadro quanto para a lista que ele abre.
 */
export async function GET(request: Request) {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;

  const { adminClient } = auth;
  const params = new URL(request.url).searchParams;
  const clienteId = params.get("clienteId");

  if (!clienteId) {
    return NextResponse.json({ error: "Informe o cliente." }, { status: 400 });
  }

  const de = params.get("de");
  const ate = params.get("ate");

  // A visão detalha por dia de emissão, então um cliente com muitos anos de
  // documentos passa do bloco que o PostgREST devolve. Sem percorrer os
  // blocos, o quadro mostraria um número menor do que a lista.
  const linhas: LinhaVisao[] = [];

  for (let inicio = 0; ; inicio += TAMANHO_BLOCO) {
    let consulta = adminClient
      .from("painel_fiscal_documentos_por_tipo")
      .select("familia,direcao,situacao,data_emissao,quantidade")
      .eq("cliente_id", clienteId);

    if (de) consulta = consulta.gte("data_emissao", de);
    if (ate) consulta = consulta.lte("data_emissao", ate);

    const { data, error } = await consulta
      .order("data_emissao", { ascending: true, nullsFirst: true })
      .range(inicio, inicio + TAMANHO_BLOCO - 1)
      .returns<LinhaVisao[]>();

    if (error) {
      // Sem esta mensagem o erro chega como "relation does not exist", que não
      // diz o que fazer.
      const faltandoVisao = /painel_fiscal_documentos_por_tipo/i.test(error.message);
      return NextResponse.json(
        {
          error: faltandoVisao
            ? "A visao painel_fiscal_documentos_por_tipo ainda nao existe no banco. Aplique a migration 20260801100000_criar_visao_documentos_por_tipo.sql pelo SQL Editor do Supabase."
            : `Nao foi possivel resumir os documentos: ${error.message}`,
        },
        { status: 500 }
      );
    }

    linhas.push(...(data ?? []));
    if ((data?.length ?? 0) < TAMANHO_BLOCO) break;
  }

  // O dia serve para filtrar; a tela quer o total por quadro.
  const agrupadas = new Map<
    string,
    { familia: string; direcao: string; situacao: string; quantidade: number }
  >();

  for (const l of linhas) {
    const chave = `${l.familia}|${l.direcao}|${l.situacao}`;
    const atual = agrupadas.get(chave);

    if (atual) atual.quantidade += Number(l.quantidade ?? 0);
    else {
      agrupadas.set(chave, {
        familia: l.familia,
        direcao: l.direcao,
        situacao: l.situacao,
        quantidade: Number(l.quantidade ?? 0),
      });
    }
  }

  const resultado = [...agrupadas.values()];

  return NextResponse.json({
    linhas: resultado,
    total: resultado.reduce((soma, l) => soma + l.quantidade, 0),
  });
}
