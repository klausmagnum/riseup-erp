import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  sincronizarClienteNFe,
  type ClienteSincronizavel,
  type ResultadoSincronizacao,
} from "@/app/lib/sefaz/sincronizarCliente";
import type { RegistroCertificado } from "@/app/lib/sefaz/certificado";

export const runtime = "nodejs";
// Plano Pro. Mesmo com folga, a execução continua limitada por orçamento e a
// fila é ordenada pela última sincronização: quem não couber nesta chamada
// entra na próxima, sem reprocessar o que já foi lido.
export const maxDuration = 300;

/**
 * Sincronização automática de NF-e recebidas.
 *
 * Percorre a fila de clientes ativos e processa quantos couberem no orçamento
 * de tempo. Quem não for atendido nesta execução fica no início da fila da
 * próxima, porque a ordenação é pela data da última sincronização.
 */

// Deixa folga para gravar o resumo antes de a função ser cortada.
const RESERVA_FINAL_MS = 20_000;
// O orçamento é repartido entre os clientes que faltam, para um cliente com
// muito atraso não monopolizar a execução. O piso existe porque uma fatia menor
// que isso não cobre nem um lote da SEFAZ: quem recebe menos para de vez.
const ORCAMENTO_MINIMO_MS = 90_000;

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

  // Os certificados vêm de uma vez só. Consultar um por cliente dentro do laço
  // custava um round-trip por cliente sem certificado — quase todos — e ainda
  // fazia o orçamento ser repartido com quem nunca chegaria a sincronizar.
  const { data: certificados } = await supabase
    .from("cliente_certificados")
    .select("id,cliente_id,nome,drive_file_id,senha_criptografada,data_validade,ativo")
    .eq("ativo", true)
    .is("deleted_at", null)
    .in("cliente_id", clientes.map((c) => c.id))
    .order("cliente_id", { ascending: true })
    .order("principal", { ascending: false })
    .returns<RegistroCertificado[]>();

  const certificadoDoCliente = new Map<string, RegistroCertificado>();
  for (const certificado of certificados ?? []) {
    // A ordenação põe o principal na frente; o primeiro de cada cliente vence.
    if (!certificadoDoCliente.has(certificado.cliente_id)) {
      certificadoDoCliente.set(certificado.cliente_id, certificado);
    }
  }

  const elegiveis = clientes.filter((c) => certificadoDoCliente.has(c.id));
  const semCertificado = clientes
    .filter((c) => !certificadoDoCliente.has(c.id))
    .map((c) => c.razao_social);

  const limiteGlobal = inicio + (maxDuration * 1000 - RESERVA_FINAL_MS);
  const resultados: ResultadoSincronizacao[] = [];
  let pendentes = elegiveis.length;

  for (const cliente of elegiveis) {
    if (Date.now() > limiteGlobal) break;

    const certificado = certificadoDoCliente.get(cliente.id)!;
    const fatia = Math.max(ORCAMENTO_MINIMO_MS, (limiteGlobal - Date.now()) / pendentes);
    pendentes -= 1;

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

    const deadlineCliente = Math.min(limiteGlobal, Date.now() + fatia);

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
    naoAlcancados: elegiveis.length - resultados.length,
    documentosImportados: importados,
    clientesComErro: comErro.map((r) => ({ cliente: r.cliente, mensagem: r.mensagem })),
    clientesSemCertificado: semCertificado,
  });
}
