"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import ErpChrome from "@/app/components/ErpChrome";
import DocumentosFiscaisTable from "../../DocumentosFiscaisTable";

export const dynamic = "force-dynamic";

type Situacao =
  | "ok"
  | "erro"
  | "sem_certificado"
  | "certificado_vencendo"
  | "certificado_vencido"
  | "nunca_sincronizado";

interface ClientePainel {
  cliente_id: string;
  razao_social: string;
  cnpj: string | null;
  uf: string | null;
  situacao: Situacao;
  ultima_sincronizacao_nfe: string | null;
  ultima_sincronizacao_nfe_status: string | null;
  mensagem_ultima_sincronizacao_nfe: string | null;
  proxima_sincronizacao_nfe: string | null;
  certificado_nome: string | null;
  certificado_validade: string | null;
  total_documentos: number;
  documentos_completos: number;
  documentos_resumo: number;
  documentos_evento: number;
  documentos_recentes: number;
  ultima_emissao: string | null;
}

interface Sincronizacao {
  id: string;
  status: string | null;
  data_inicio: string | null;
  quantidade_encontrada: number | null;
  quantidade_importada: number | null;
  quantidade_erro: number | null;
  mensagem: string | null;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const SITUACOES: Record<Situacao, { rotulo: string; classe: string }> = {
  ok: { rotulo: "Em dia", classe: "border-emerald-300/30 bg-emerald-300/10 text-emerald-200" },
  erro: { rotulo: "Com erro", classe: "border-rose-300/30 bg-rose-300/10 text-rose-200" },
  sem_certificado: {
    rotulo: "Sem certificado",
    classe: "border-slate-300/20 bg-slate-300/10 text-slate-300",
  },
  certificado_vencendo: {
    rotulo: "Certificado vencendo",
    classe: "border-amber-300/30 bg-amber-300/10 text-amber-200",
  },
  certificado_vencido: {
    rotulo: "Certificado vencido",
    classe: "border-rose-300/30 bg-rose-300/10 text-rose-200",
  },
  nunca_sincronizado: {
    rotulo: "Nunca sincronizado",
    classe: "border-sky-300/30 bg-sky-300/10 text-sky-200",
  },
};

function data(iso: string | null) {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

function momento(iso: string | null) {
  if (!iso) return "nunca";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function comToken(url: string) {
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase nao configurado.");
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: sessao } = await supabase.auth.getSession();
  const token = sessao?.session?.access_token;
  if (!token) throw new Error("Sessao expirada. Entre novamente.");

  const resposta = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const dados = await resposta.json();
  if (!resposta.ok) throw new Error(dados.error || "Falha na consulta.");
  return dados;
}

export default function ClienteFiscalPage() {
  const parametros = useParams();
  const clienteId = String(parametros?.id ?? "");

  const [cliente, setCliente] = useState<ClientePainel | null>(null);
  const [sincronizacoes, setSincronizacoes] = useState<Sincronizacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [verHistorico, setVerHistorico] = useState(false);

  // Recarga é disparada por evento, não pelo corpo do efeito: mudar estado de
  // forma síncrona ali provoca renderização em cascata.
  const [recarga, setRecarga] = useState(0);

  const recarregar = useCallback(() => {
    setCarregando(true);
    setRecarga((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!clienteId) return;
    let ativo = true;

    (async () => {
      try {
        const [painel, historico] = await Promise.all([
          comToken(`/api/documentos-fiscais/painel?clienteId=${clienteId}`),
          comToken(`/api/documentos-fiscais/sincronizacoes?clienteId=${clienteId}`),
        ]);
        if (!ativo) return;

        setCliente(painel.clientes?.[0] ?? null);
        setSincronizacoes(historico.sincronizacoes ?? []);
        setErro("");
      } catch (e) {
        if (ativo) setErro(e instanceof Error ? e.message : "Erro desconhecido.");
      } finally {
        if (ativo) setCarregando(false);
      }
    })();

    return () => {
      ativo = false;
    };
  }, [clienteId, recarga]);

  const selo = cliente ? (SITUACOES[cliente.situacao] ?? SITUACOES.ok) : null;

  const cartoes = cliente
    ? [
        {
          t: "XML completo",
          v: cliente.documentos_completos,
          e: "Notas prontas para escrituração.",
          cor: "text-emerald-200",
        },
        {
          t: "Aguardando manifestação",
          v: cliente.documentos_resumo,
          e: "A SEFAZ liberou só o resumo destas.",
          cor: cliente.documentos_resumo > 0 ? "text-amber-200" : "text-slate-100",
        },
        {
          t: "Eventos",
          v: cliente.documentos_evento,
          e: "Cancelamentos e cartas de correção.",
          cor: "text-slate-100",
        },
        {
          t: "Capturados em 7 dias",
          v: cliente.documentos_recentes,
          e: "Entraram na última semana.",
          cor: cliente.documentos_recentes > 0 ? "text-sky-200" : "text-slate-100",
        },
      ]
    : [];

  return (
    <ErpChrome>
      <Link
        className="text-[11px] font-bold text-sky-300 transition hover:text-sky-200"
        href="/documentos-fiscais/painel"
      >
        ← Voltar ao painel
      </Link>

      {erro && (
        <div className="mt-4 rounded-lg border border-rose-300/25 bg-rose-300/10 px-3 py-3 text-xs text-rose-100">
          {erro}
        </div>
      )}

      {carregando && !cliente && (
        <p className="mt-8 text-center text-sm text-sky-100">Carregando cliente...</p>
      )}

      {!carregando && !cliente && !erro && (
        <p className="mt-8 text-center text-sm text-slate-400">Cliente não encontrado.</p>
      )}

      {cliente && (
        <>
          <header className="mt-3 flex items-start justify-between gap-4 max-[760px]:flex-col">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-300">
                Documentos Fiscais
              </p>
              <h1 className="mt-1 text-2xl font-black leading-tight">{cliente.razao_social}</h1>
              <p className="mt-1 text-xs text-slate-400">
                {cliente.cnpj ?? "sem CNPJ"}
                {cliente.uf ? ` · ${cliente.uf}` : ""}
                {" · "}
                última sincronização {momento(cliente.ultima_sincronizacao_nfe)}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {selo && (
                <span
                  className={`inline-block whitespace-nowrap rounded-md border px-2.5 py-1.5 text-[11px] font-bold ${selo.classe}`}
                >
                  {selo.rotulo}
                </span>
              )}
              <button
                className="min-h-9 rounded-lg border border-white/10 px-3 text-xs font-bold text-slate-200 transition hover:border-sky-300/40 hover:text-sky-100"
                type="button"
                onClick={recarregar}
                disabled={carregando}
              >
                {carregando ? "Atualizando..." : "Atualizar"}
              </button>
            </div>
          </header>

          {cliente.situacao === "erro" && cliente.mensagem_ultima_sincronizacao_nfe && (
            <div className="mt-4 rounded-lg border border-rose-300/25 bg-rose-300/10 px-3 py-3 text-xs text-rose-100">
              <strong className="font-black">A última sincronização falhou:</strong>{" "}
              {cliente.mensagem_ultima_sincronizacao_nfe}
            </div>
          )}

          {cliente.proxima_sincronizacao_nfe &&
            new Date(cliente.proxima_sincronizacao_nfe) > new Date() && (
              <div className="mt-4 rounded-lg border border-amber-300/25 bg-amber-300/10 px-3 py-3 text-xs text-amber-100">
                A SEFAZ limita consultas repetidas. Este cliente volta a ser consultado
                a partir de {momento(cliente.proxima_sincronizacao_nfe)}.
              </div>
            )}

          {!cliente.certificado_nome && (
            <div className="mt-4 rounded-lg border border-slate-300/20 bg-slate-300/[0.06] px-3 py-3 text-xs text-slate-300">
              Este cliente não tem certificado A1 cadastrado, então não é consultado na
              SEFAZ. Cadastre em{" "}
              <Link
                className="font-bold text-sky-300 hover:text-sky-200"
                href={`/cadastros/clientes/editar?id=${cliente.cliente_id}`}
              >
                Cadastros › Clientes › Certificados
              </Link>
              .
            </div>
          )}

          <section className="mt-5 grid grid-cols-4 gap-3 max-[1180px]:grid-cols-2 max-[640px]:grid-cols-1">
            {cartoes.map((c) => (
              <article
                className="rounded-xl border border-white/10 bg-[#061020]/88 p-4 shadow-2xl shadow-black/20"
                key={c.t}
              >
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                  {c.t}
                </p>
                <strong className={`mt-2 block text-3xl font-black ${c.cor}`}>{c.v}</strong>
                <p className="mt-1.5 text-[11px] leading-4 text-slate-500">{c.e}</p>
              </article>
            ))}
          </section>

          {cliente.certificado_nome && (
            <section className="mt-5 rounded-2xl border border-white/10 bg-[#061020]/88 p-4 shadow-2xl shadow-black/20">
              <h2 className="text-sm font-black text-slate-100">Certificado em uso</h2>
              <p className="mt-1.5 text-xs text-slate-400">
                <span className="text-slate-200">{cliente.certificado_nome}</span>
                {" · vence em "}
                {data(cliente.certificado_validade)}
                {" · último documento emitido em "}
                {data(cliente.ultima_emissao)}
              </p>
            </section>
          )}

          <h2 className="mt-7 text-sm font-black text-slate-100">
            Documentos capturados ({cliente.total_documentos})
          </h2>
          <DocumentosFiscaisTable clienteInicial={cliente.cliente_id} />

          <section className="mt-5 rounded-2xl border border-white/10 bg-[#061020]/88 p-4 shadow-2xl shadow-black/20">
            <button
              className="text-xs font-black text-slate-300 transition hover:text-sky-200"
              type="button"
              onClick={() => setVerHistorico((v) => !v)}
            >
              {verHistorico ? "▾" : "▸"} Histórico de sincronização ({sincronizacoes.length})
            </button>

            {verHistorico && (
              <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full min-w-[720px] border-collapse text-left text-xs">
                  <thead className="bg-slate-950/70 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                    <tr>
                      <th className="px-3 py-3 font-black">Quando</th>
                      <th className="px-3 py-3 font-black">Resultado</th>
                      <th className="px-3 py-3 text-right font-black">Encontrados</th>
                      <th className="px-3 py-3 text-right font-black">Importados</th>
                      <th className="px-3 py-3 font-black">Observação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sincronizacoes.length === 0 && (
                      <tr>
                        <td className="px-3 py-6 text-center text-slate-400" colSpan={5}>
                          Nenhuma sincronização registrada para este cliente.
                        </td>
                      </tr>
                    )}
                    {sincronizacoes.map((s) => {
                      const falhou = (s.status ?? "").toLowerCase().includes("erro");
                      return (
                        <tr className="border-t border-white/5" key={s.id}>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-400">
                            {momento(s.data_inicio)}
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={`inline-block whitespace-nowrap rounded-md border px-2 py-1 text-[10px] font-bold ${
                                falhou
                                  ? "border-rose-300/30 bg-rose-300/10 text-rose-200"
                                  : "border-emerald-300/30 bg-emerald-300/10 text-emerald-200"
                              }`}
                            >
                              {s.status ?? "—"}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right text-slate-300">
                            {s.quantidade_encontrada ?? 0}
                          </td>
                          <td className="px-3 py-3 text-right text-slate-100">
                            {s.quantidade_importada ?? 0}
                          </td>
                          <td className="px-3 py-3 text-slate-400">{s.mensagem ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </ErpChrome>
  );
}
