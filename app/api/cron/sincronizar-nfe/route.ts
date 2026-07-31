import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  sincronizarClienteNFe,
  type ClienteSincronizavel,
  type ResultadoSincronizacao,
} from "@/app/lib/sefaz/sincronizarCliente";
import type { RegistroCertificado } from "@/app/lib/sefaz/certificado";

export const runtime = "nodejs";
// 60s e o teto do plano Hobby da Vercel. Por isso cada execucao processa um
// lote pequeno e para: a fila e ordenada pela ultima sincronizacao, entao a
// chamada seguinte pega quem ficou para tras.
export const maxDuration = 60;

/**
 * Sincronização automática de NF-e recebidas.
 *
 * Percorre a fila de clientes ativos e processa quantos couberem no orçamento
 * de tempo. Quem não for atendido nesta execução fica no início da fila da
 * próxima, porque a ordenação é pela data da última sincronização.
 */

// Deixa folga para gravar o resumo antes de a função ser cortada.
const RESERVA_FINAL_MS = 10_000;
// Cada cliente recebe uma fatia, para um cliente com muito atraso não
// monopolizar a execução inteira. Dentro de 60s isso dá 2 clientes por
// chamada em média — daí a fila valer mais que a frequência do agendador.
const ORCAMENTO_POR_CLIENTE_MS = 22_000;

function autorizado(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const [tipo, token] = header.split(" ");
  return tipo?.toLowerCase() === "bearer" && token === secret;
}

export async function GET(request: Request) {
  const inicio = Date.now();

  if (!autorizado(request)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Supabase nao configurado" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const agora = new Date().toISOString();

  const { data: clientes, error: filaError } = await supabase
    .from("clientes")
    .select("id,razao_social,identificacao,estado,ultimo_nsu_nfe_recebida")
    .eq("status", "Ativo")
    .eq("sincronizacao_nfe_ativa", true)
    .or(`proxima_sincronizacao_nfe.is.null,proxima_sincronizacao_nfe.lte.${agora}`)
    .order("ultima_sincronizacao_nfe", { ascending: true, nullsFirst: true })
    .limit(120)
    .returns<ClienteSincronizavel[]>();

  if (filaError) {
    return NextResponse.json(
      { error: `Falha ao montar a fila: ${filaError.message}` },
      { status: 500 }
    );
  }

  if (!clientes?.length) {
    return NextResponse.json({ ok: true, processados: 0, mensagem: "Fila vazia." });
  }

  const limiteGlobal = inicio + (maxDuration * 1000 - RESERVA_FINAL_MS);
  const resultados: ResultadoSincronizacao[] = [];
  const semCertificado: string[] = [];
  let restantes = clientes.length;

  for (const cliente of clientes) {
    if (Date.now() > limiteGlobal) break;
    restantes -= 1;

    const { data: certificado } = await supabase
      .from("cliente_certificados")
      .select("id,cliente_id,nome,drive_file_id,senha_criptografada,data_validade,ativo")
      .eq("cliente_id", cliente.id)
      .eq("ativo", true)
      .is("deleted_at", null)
      .order("principal", { ascending: false })
      .limit(1)
      .maybeSingle<RegistroCertificado>();

    if (!certificado) {
      semCertificado.push(cliente.razao_social);
      continue;
    }

    const { data: execucao } = await supabase
      .from("documentos_fiscais_sincronizacoes")
      .insert({
        cliente_id: cliente.id,
        tipo_documento: "NFe",
        certificado_id: certificado.id,
        status: "Executando",
        data_inicio: new Date().toISOString(),
        mensagem: "Disparado pelo agendamento automatico.",
      })
      .select("id")
      .single();

    const deadlineCliente = Math.min(
      limiteGlobal,
      Date.now() + ORCAMENTO_POR_CLIENTE_MS
    );

    const resultado = await sincronizarClienteNFe({
      supabase,
      cliente,
      certificado,
      ambiente: "producao",
      deadline: deadlineCliente,
    });

    resultados.push(resultado);

    if (execucao) {
      await supabase
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
  }

  const importados = resultados.reduce((soma, r) => soma + r.importados, 0);
  const comErro = resultados.filter((r) => r.status === "Erro");

  return NextResponse.json({
    ok: true,
    duracaoMs: Date.now() - inicio,
    processados: resultados.length,
    naoAlcancados: restantes,
    documentosImportados: importados,
    clientesComErro: comErro.map((r) => ({ cliente: r.cliente, mensagem: r.mensagem })),
    clientesSemCertificado: semCertificado,
  });
}
