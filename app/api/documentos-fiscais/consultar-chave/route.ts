import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  capturarChaves,
  type ClienteConsultante,
} from "@/app/lib/sefaz/capturarPorChave";
import { destrincharChave } from "@/app/lib/sefaz/parseDocumento";
import type { RegistroCertificado } from "@/app/lib/sefaz/certificado";

// O certificado A1 exige mTLS via módulo https do Node — não roda no runtime Edge.
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Captura de documentos por chave de acesso.
 *
 * Serve à NFC-e, que não tem fila de NSU no ambiente nacional, e ao resgate
 * avulso de uma NF-e ou CT-e específico.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Uma consulta por chave leva alguns segundos; o resto do orçamento fica para
 *  gravar o que já veio antes de a função ser cortada. */
const RESERVA_FINAL_MS = 8_000;

/** Teto por requisição: mais que isso não cabe no tempo da função, e a resposta
 *  devolve o que sobrou para uma segunda rodada. */
const MAX_CHAVES = 50;

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
    return { error: NextResponse.json({ error: "Token nao fornecido" }, { status: 401 }) };
  }

  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser(token);

  if (authError || !user?.email) {
    return { error: NextResponse.json({ error: "Token invalido" }, { status: 401 }) };
  }

  const { data: usuario } = await adminClient
    .from("usuarios_sistema")
    .select("*")
    .ilike("email", user.email)
    .maybeSingle();

  if (!usuario || (usuario.status ?? "").toLowerCase() === "inativo") {
    return { error: NextResponse.json({ error: "Usuario sem acesso." }, { status: 403 }) };
  }

  return { adminClient, usuario };
}

function podeSincronizar(usuario: Record<string, unknown>) {
  const perfil = String(usuario.perfil ?? "").toLowerCase();
  if (["administrador", "gestor"].includes(perfil)) return true;
  const permissoes = usuario.permissoes as Record<string, boolean> | null | undefined;
  return Boolean(permissoes?.["documentos_fiscais.sincronizar"]);
}

/** Aceita chaves separadas por qualquer coisa que não seja dígito: uma por
 *  linha, coladas de planilha, com espaços de quatro em quatro. */
function extrairChaves(body: Record<string, unknown>): string[] {
  const bruto = [body.chaves, body.chave]
    .flatMap((valor) => (Array.isArray(valor) ? valor : [valor]))
    .filter((valor): valor is string => typeof valor === "string")
    .join("\n");

  const chaves = bruto.match(/\d{44}/g) ?? [];

  // Colar a mesma lista duas vezes não deve dobrar as consultas à SEFAZ.
  return [...new Set(chaves)];
}

/** O tipo predominante, só para rotular a execução no histórico. */
function tipoDaLista(chaves: string[]) {
  const modelos = new Set(chaves.map((c) => destrincharChave(c).modelo));
  if (modelos.size !== 1) return "Documentos";

  const [modelo] = [...modelos];
  return { "65": "NFCe", "55": "NFe", "57": "CTe", "67": "CTeOS" }[modelo] ?? "Documentos";
}

export async function POST(request: Request) {
  const inicio = Date.now();
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;

  const { adminClient, usuario } = auth;

  if (!podeSincronizar(usuario)) {
    return NextResponse.json(
      { error: "Permissao insuficiente para capturar documentos na SEFAZ." },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const chaves = extrairChaves(body);
  const ambiente = body.ambiente === "homologacao" ? "homologacao" : "producao";

  if (!chaves.length) {
    return NextResponse.json(
      { error: "Informe ao menos uma chave de acesso de 44 digitos." },
      { status: 400 }
    );
  }

  if (chaves.length > MAX_CHAVES) {
    return NextResponse.json(
      {
        error: `Maximo de ${MAX_CHAVES} chaves por vez; foram enviadas ${chaves.length}. Divida a lista.`,
      },
      { status: 400 }
    );
  }

  const clienteId = typeof body.clienteId === "string" ? body.clienteId : "";

  // Posições 7-20 da chave são o CNPJ do emitente. Sem cliente informado, é
  // ele quem identifica de quem é a nota — o caso da NFC-e de saída, em que a
  // chave já diz tudo.
  const cnpjDaChave = chaves[0].slice(6, 20);

  const consulta = adminClient
    .from("clientes")
    .select("id,razao_social,identificacao,estado");

  const { data: cliente } = clienteId
    ? await consulta.eq("id", clienteId).maybeSingle<ClienteConsultante>()
    : await consulta
        .returns<ClienteConsultante[]>()
        // O cadastro guarda o CNPJ com máscara em parte das linhas, então a
        // comparação tem de ser por dígitos — o que o banco não filtra.
        .then(({ data }) => ({
          data:
            data?.find(
              (c) => (c.identificacao ?? "").replace(/\D/g, "") === cnpjDaChave
            ) ?? null,
        }));

  if (!cliente) {
    return NextResponse.json(
      {
        error: clienteId
          ? "Cliente nao encontrado."
          : `Nenhum cliente cadastrado com o CNPJ ${cnpjDaChave}, emitente da primeira chave. Informe o cliente.`,
      },
      { status: 404 }
    );
  }

  const { data: certificado } = await adminClient
    .from("cliente_certificados")
    .select("id,cliente_id,nome,drive_file_id,senha_criptografada,data_validade,ativo")
    .eq("cliente_id", cliente.id)
    .eq("ativo", true)
    .is("deleted_at", null)
    .order("principal", { ascending: false })
    .limit(1)
    .maybeSingle<RegistroCertificado>();

  if (!certificado) {
    return NextResponse.json(
      { error: `Nenhum certificado ativo para ${cliente.razao_social}.` },
      { status: 404 }
    );
  }

  const { data: execucao } = await adminClient
    .from("documentos_fiscais_sincronizacoes")
    .insert({
      cliente_id: cliente.id,
      tipo_documento: tipoDaLista(chaves),
      certificado_id: certificado.id,
      status: "Executando",
      data_inicio: new Date().toISOString(),
      mensagem: `Consulta por chave: ${chaves.length} chave(s).`,
    })
    .select("id")
    .single();

  let resultados;
  let naoAlcancadas: string[];

  try {
    ({ resultados, naoAlcancadas } = await capturarChaves({
      supabase: adminClient,
      cliente,
      certificado,
      chaves,
      ambiente,
      deadline: inicio + (maxDuration * 1000 - RESERVA_FINAL_MS),
    }));
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido.";

    if (execucao) {
      await adminClient
        .from("documentos_fiscais_sincronizacoes")
        .update({ status: "Erro", data_fim: new Date().toISOString(), mensagem })
        .eq("id", execucao.id);
    }

    return NextResponse.json({ error: mensagem }, { status: 502 });
  }

  const gravados = resultados.reduce((soma, r) => soma + r.gravados, 0);
  const duplicados = resultados.reduce((soma, r) => soma + r.duplicados, 0);
  const recusadas = resultados.filter((r) => !r.ok);

  const mensagem = `${gravados} capturado(s), ${duplicados} ja existente(s), ${recusadas.length} sem retorno.`;

  if (execucao) {
    await adminClient
      .from("documentos_fiscais_sincronizacoes")
      .update({
        status: gravados > 0 ? "Sucesso" : recusadas.length === chaves.length ? "Erro" : "Sem novidades",
        data_fim: new Date().toISOString(),
        quantidade_encontrada: resultados.length,
        quantidade_importada: gravados,
        quantidade_erro: recusadas.length,
        mensagem,
      })
      .eq("id", execucao.id);
  }

  return NextResponse.json({
    ok: true,
    cliente: cliente.razao_social,
    clienteId: cliente.id,
    consultadas: resultados.length,
    gravados,
    duplicados,
    naoAlcancadas,
    mensagem,
    resultados,
  });
}
