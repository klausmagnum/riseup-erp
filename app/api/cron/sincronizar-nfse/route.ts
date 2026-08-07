import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  sincronizarClienteNFSe,
  type ClienteSincronizavelNFSe,
  type ResultadoSincronizacaoNFSe,
} from "@/app/lib/nfse/sincronizarClienteNFSe";
import type { RegistroCertificado } from "@/app/lib/sefaz/certificado";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Captura automática de NFS-e pelo ambiente nacional.
 *
 * Roda em horário diferente do cron de NF-e de propósito: as duas usam o mesmo
 * certificado do cliente e o ADN recusa consumo repetido com HTTP 429.
 */

const RESERVA_FINAL_MS = 20_000;
// O orçamento é repartido entre os clientes que faltam, com o mesmo piso da
// NF-e. O piso não é folga: sincronizarClienteNFSe reserva um lote inteiro
// (RESERVA_POR_LOTE_MS) antes de pedir o próximo, então uma fatia do tamanho
// dessa reserva faz o laço sair antes da primeira consulta e o fluxo parar de
// vez, sem sequer falar com o ADN — foi o que aconteceu com CT-e e MDF-e.
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
    .select("id,razao_social,identificacao,ultimo_nsu_nfse_recebida")
    .eq("status", "Ativo")
    .eq("sincronizacao_nfse_ativa", true)
    .or(`proxima_sincronizacao_nfse.is.null,proxima_sincronizacao_nfse.lte.${agora}`)
    .order("ultima_sincronizacao_nfse", { ascending: true, nullsFirst: true })
    .limit(120)
    .returns<ClienteSincronizavelNFSe[]>();

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
  const resultados: ResultadoSincronizacaoNFSe[] = [];
  const semCertificado: string[] = [];
  let restantes = clientes.length;

  for (const cliente of clientes) {
    if (Date.now() > limiteGlobal) break;

    const fatia = Math.max(ORCAMENTO_MINIMO_MS, (limiteGlobal - Date.now()) / restantes);
    restantes -= 1;

    // Sem certificado não há consulta ao ambiente nacional, do mesmo jeito que
    // na NF-e: o cliente é apenas nomeado no relatório.
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
        tipo_documento: "NFSe",
        certificado_id: certificado.id,
        status: "Executando",
        data_inicio: new Date().toISOString(),
        mensagem: "Disparado pelo agendamento automatico.",
      })
      .select("id")
      .single();

    const resultado = await sincronizarClienteNFSe({
      supabase,
      cliente,
      certificado,
      ambiente: "producao",
      deadline: Math.min(limiteGlobal, Date.now() + fatia),
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
