import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  filtrarEventosDaFamilia,
  filtrarPorDirecao,
  filtrarPorFamilia,
} from "@/app/lib/documentosFiscais/classificacao";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TAMANHO_PAGINA_PADRAO = 50;
const TAMANHO_PAGINA_MAXIMO = 200;

/**
 * A query é montada em etapas conforme os filtros, e nesse caminho o cliente
 * do Supabase perde a inferência do tipo da linha. Declarar aqui é o que
 * mantém o retorno tipado do outro lado.
 */
interface DocumentoRow {
  id: string;
  cliente_id: string | null;
  tipo_documento: string;
  numero: string | null;
  serie: string | null;
  chave_acesso: string | null;
  data_emissao: string | null;
  valor_total: number | null;
  emitente_nome: string | null;
  emitente_cnpj_cpf: string | null;
  destinatario_nome: string | null;
  uf: string | null;
  municipio: string | null;
  status_documento: string | null;
  completude: string | null;
  origem: string | null;
  nsu: string | null;
  xml_storage_path: string | null;
  drive_file_id: string | null;
  possui_pendencia: boolean | null;
  created_at: string | null;
}

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
    .select("id,nome,email,perfil,status")
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
  const params = new URL(request.url).searchParams;

  const pagina = Math.max(1, Number(params.get("pagina") ?? 1));
  const tamanho = Math.min(
    TAMANHO_PAGINA_MAXIMO,
    Math.max(1, Number(params.get("tamanho") ?? TAMANHO_PAGINA_PADRAO))
  );

  let query = adminClient
    .from("documentos_fiscais")
    .select(
      "id,cliente_id,tipo_documento,numero,serie,chave_acesso,data_emissao," +
        "valor_total,emitente_nome,emitente_cnpj_cpf,destinatario_nome,uf,municipio," +
        "status_documento,completude,origem,nsu,xml_storage_path,drive_file_id," +
        "possui_pendencia,created_at",
      { count: "exact" }
    )
    .is("deleted_at", null);

  // Quando o XML integral chega, o resumo da mesma nota é marcado como
  // substituído. Mostrar os dois faria a nota aparecer duas vezes na consulta,
  // então o padrão é ocultar — mas o histórico continua acessível.
  if (params.get("incluirSubstituidos") !== "1") {
    query = query.or("status_processamento.is.null,status_processamento.neq.Substituido");
  }

  const clienteId = params.get("clienteId");
  if (clienteId) query = query.eq("cliente_id", clienteId);

  const tipo = params.get("tipo");
  if (tipo) query = query.eq("tipo_documento", tipo);

  // Família e direção são os quadros da tela do cliente. A classificação segue
  // a mesma regra da visão painel_fiscal_documentos_por_tipo, que produz a
  // contagem exibida no quadro.
  const familia = params.get("familia");
  if (familia) query = filtrarPorFamilia(query, familia);

  const direcao = params.get("direcao");
  if (direcao) {
    if (!clienteId) {
      return NextResponse.json(
        { error: "Entrada e saida dependem do cliente: informe clienteId." },
        { status: 400 }
      );
    }

    // Saída é o que o próprio cliente emitiu, então a comparação precisa do
    // CNPJ do cadastro.
    const { data: cliente } = await adminClient
      .from("clientes")
      .select("identificacao")
      .eq("id", clienteId)
      .maybeSingle();

    query = filtrarPorDirecao(query, direcao, cliente?.identificacao);
  }

  // "indefinido" são os documentos gravados antes da coluna de completude
  // existir: continuam capturados e precisam aparecer em algum lugar.
  const completude = params.get("completude");
  if (completude === "indefinido") query = query.is("completude", null);
  else if (completude) query = query.eq("completude", completude);

  const de = params.get("de");
  if (de) query = query.gte("data_emissao", de);

  const ate = params.get("ate");
  if (ate) query = query.lte("data_emissao", ate);

  // Busca livre por emitente ou chave — é como o pessoal do escritório procura
  // uma nota específica quando o cliente liga perguntando.
  const busca = (params.get("busca") ?? "").trim();
  if (busca) {
    const termo = busca.replace(/[%,]/g, "");
    query = query.or(
      `emitente_nome.ilike.%${termo}%,chave_acesso.ilike.%${termo}%,numero.ilike.%${termo}%`
    );
  }

  const inicio = (pagina - 1) * tamanho;

  const { data, count, error } = await query
    .order("data_emissao", { ascending: false, nullsFirst: false })
    .order("nsu", { ascending: false })
    .range(inicio, inicio + tamanho - 1);

  if (error) {
    return NextResponse.json(
      { error: `Nao foi possivel listar os documentos: ${error.message}` },
      { status: 500 }
    );
  }

  // Nome do cliente numa segunda consulta: são poucos e evita join custoso
  // por linha.
  const linhas = (data ?? []) as unknown as DocumentoRow[];
  const idsClientes = [...new Set(linhas.map((d) => d.cliente_id).filter(Boolean))];
  const nomes: Record<string, string> = {};

  if (idsClientes.length > 0) {
    const { data: clientes } = await adminClient
      .from("clientes")
      .select("id,razao_social")
      .in("id", idsClientes);

    for (const c of clientes ?? []) nomes[c.id] = c.razao_social;
  }

  const documentos = linhas.map((d) => ({
    ...d,
    cliente_nome: d.cliente_id ? (nomes[d.cliente_id] ?? "") : "",
  }));

  // Contagens para os cartões do topo. São consultas com head:true, que
  // devolvem só o número e não trafegam linha nenhuma.
  function contar() {
    const q = adminClient
      .from("documentos_fiscais")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .or("status_processamento.is.null,status_processamento.neq.Substituido");

    return clienteId ? q.eq("cliente_id", clienteId) : q;
  }

  // Os cartões acompanham a família da tela: numa tela de NFC-e, contar NF-e
  // daria um número que não tem relação com nenhuma linha da listagem.
  const notasDaFamilia = () =>
    familia ? filtrarPorFamilia(contar(), familia) : contar().eq("tipo_documento", "NFe");

  const [notas, aguardando, eventos] = await Promise.all([
    notasDaFamilia(),
    notasDaFamilia().eq("completude", "resumo"),
    familia
      ? filtrarEventosDaFamilia(contar(), familia)
      : contar().eq("tipo_documento", "EventoNFe"),
  ]);

  return NextResponse.json({
    documentos,
    total: count ?? 0,
    pagina,
    tamanho,
    paginas: Math.max(1, Math.ceil((count ?? 0) / tamanho)),
    resumo: {
      notas: notas.count ?? 0,
      aguardandoManifestacao: aguardando.count ?? 0,
      eventos: eventos.count ?? 0,
    },
  });
}
