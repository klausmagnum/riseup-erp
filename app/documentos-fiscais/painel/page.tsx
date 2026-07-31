"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import ErpChrome from "@/app/components/ErpChrome";

export const dynamic = "force-dynamic";

interface Indicadores {
  documentosRecentes: number;
  documentosTotal: number;
  pendenciasAbertas: number;
  clientesAtivos: number;
  clientesComCertificado: number;
  clientesSemCertificado: number;
  clientesComErro: number;
  certificadosVencendo: number;
}

interface Sincronizacao {
  id: string;
  cliente_nome: string;
  tipo_documento: string | null;
  status: string | null;
  data_inicio: string | null;
  quantidade_encontrada: number | null;
  quantidade_importada: number | null;
  mensagem: string | null;
}

interface CertificadoVencendo {
  id: string;
  nome: string;
  cliente_nome: string;
  data_validade: string;
  dias: number;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function formatarMomento(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Cartao({
  titulo,
  valor,
  explicacao,
  tom = "neutro",
}: {
  titulo: string;
  valor: number | string;
  explicacao: string;
  tom?: "neutro" | "bom" | "atencao" | "ruim";
}) {
  const cores = {
    neutro: "text-slate-100",
    bom: "text-emerald-200",
    atencao: "text-amber-200",
    ruim: "text-rose-200",
  };

  return (
    <article className="rounded-xl border border-white/10 bg-[#061020]/88 p-4 shadow-2xl shadow-black/20">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{titulo}</p>
      <strong className={`mt-2 block text-3xl font-black ${cores[tom]}`}>{valor}</strong>
      <p className="mt-1.5 text-[11px] leading-4 text-slate-500">{explicacao}</p>
    </article>
  );
}

export default function PainelFiscalPage() {
  const [indicadores, setIndicadores] = useState<Indicadores | null>(null);
  const [sincronizacoes, setSincronizacoes] = useState<Sincronizacao[]>([]);
  const [certificados, setCertificados] = useState<CertificadoVencendo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");

    try {
      if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase nao configurado.");
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error("Sessao expirada. Entre novamente.");

      const resposta = await fetch("/api/documentos-fiscais/painel", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.error || "Falha ao carregar o painel.");

      setIndicadores(dados.indicadores);
      setSincronizacoes(dados.sincronizacoes ?? []);
      setCertificados(dados.certificadosVencendo ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const i = indicadores;
  const cobertura =
    i && i.clientesAtivos > 0
      ? Math.round((i.clientesComCertificado / i.clientesAtivos) * 100)
      : 0;

  return (
    <ErpChrome>
      <header className="flex items-start justify-between gap-4 max-[760px]:flex-col">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-300">
            Documentos Fiscais
          </p>
          <h1 className="mt-1 text-2xl font-black leading-tight">Painel</h1>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
            O sistema busca sozinho, na SEFAZ, as notas emitidas contra o CNPJ de cada
            cliente e arquiva os XMLs no Google Drive. Esta tela mostra se isso está
            funcionando e o que precisa da sua atenção.
          </p>
        </div>
        <button
          className="min-h-9 rounded-lg border border-white/10 px-3 text-xs font-bold text-slate-200 transition hover:border-sky-300/40 hover:text-sky-100"
          type="button"
          onClick={carregar}
          disabled={carregando}
        >
          {carregando ? "Atualizando..." : "Atualizar"}
        </button>
      </header>

      {erro && (
        <div className="mt-5 rounded-lg border border-rose-300/25 bg-rose-300/10 px-3 py-3 text-xs text-rose-100">
          {erro}
        </div>
      )}

      {carregando && !i && (
        <p className="mt-8 text-center text-sm text-sky-100">Carregando painel...</p>
      )}

      {i && (
        <>
          <h2 className="mt-6 text-sm font-black text-slate-100">Captura automática</h2>
          <section className="mt-3 grid grid-cols-4 gap-3 max-[1180px]:grid-cols-2 max-[640px]:grid-cols-1">
            <Cartao
              titulo="Capturados em 7 dias"
              valor={i.documentosRecentes}
              explicacao="Entraram no sistema na última semana. É o número que mostra se a automação está rodando."
              tom={i.documentosRecentes > 0 ? "bom" : "atencao"}
            />
            <Cartao
              titulo="Total capturado"
              valor={i.documentosTotal}
              explicacao="Tudo que já entrou, de todos os períodos."
            />
            <Cartao
              titulo="Clientes cobertos"
              valor={`${i.clientesComCertificado} de ${i.clientesAtivos}`}
              explicacao={`${cobertura}% da carteira tem certificado cadastrado. Sem ele o sistema não consulta a SEFAZ.`}
              tom={cobertura >= 80 ? "bom" : cobertura >= 30 ? "atencao" : "ruim"}
            />
            <Cartao
              titulo="Sem certificado"
              valor={i.clientesSemCertificado}
              explicacao="Clientes que ficam de fora da captura até cadastrar o certificado A1."
              tom={i.clientesSemCertificado > 0 ? "atencao" : "bom"}
            />
          </section>

          <h2 className="mt-7 text-sm font-black text-slate-100">Precisa de atenção</h2>
          <section className="mt-3 grid grid-cols-3 gap-3 max-[1180px]:grid-cols-2 max-[640px]:grid-cols-1">
            <Cartao
              titulo="Clientes com erro"
              valor={i.clientesComErro}
              explicacao="A última tentativa de sincronização falhou. Veja o motivo na tabela abaixo."
              tom={i.clientesComErro > 0 ? "ruim" : "bom"}
            />
            <Cartao
              titulo="Certificados a vencer"
              valor={i.certificadosVencendo}
              explicacao="Vencem nos próximos 30 dias. Vencido, o cliente para de ser sincronizado."
              tom={i.certificadosVencendo > 0 ? "atencao" : "bom"}
            />
            <Cartao
              titulo="Aguardando manifestação"
              valor={i.pendenciasAbertas}
              explicacao="A SEFAZ só liberou o resumo. O XML completo exige manifestar ciência da operação."
              tom={i.pendenciasAbertas > 0 ? "atencao" : "bom"}
            />
          </section>

          {certificados.length > 0 && (
            <section className="mt-5 rounded-2xl border border-amber-300/20 bg-[#061020]/88 p-4 shadow-2xl shadow-black/20">
              <h2 className="text-sm font-black text-amber-200">
                Certificados vencendo nos próximos 30 dias
              </h2>
              <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full min-w-[560px] border-collapse text-left text-xs">
                  <thead className="bg-slate-950/70 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                    <tr>
                      <th className="px-3 py-3 font-black">Cliente</th>
                      <th className="px-3 py-3 font-black">Certificado</th>
                      <th className="px-3 py-3 font-black">Vence em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {certificados.map((c) => (
                      <tr className="border-t border-white/5" key={c.id}>
                        <td className="px-3 py-3 text-slate-200">{c.cliente_nome}</td>
                        <td className="px-3 py-3 text-slate-400">{c.nome}</td>
                        <td className="px-3 py-3 font-bold text-amber-200">
                          {c.dias <= 0 ? "vencido" : `${c.dias} dia(s)`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="mt-5 rounded-2xl border border-white/10 bg-[#061020]/88 p-4 shadow-2xl shadow-black/20">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-black text-slate-100">Últimas sincronizações</h2>
              <Link
                className="text-xs font-bold text-sky-300 transition hover:text-sky-200"
                href="/documentos-fiscais/nfe"
              >
                Ver os documentos →
              </Link>
            </div>

            <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full min-w-[860px] border-collapse text-left text-xs">
                <thead className="bg-slate-950/70 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-3 py-3 font-black">Quando</th>
                    <th className="px-3 py-3 font-black">Cliente</th>
                    <th className="px-3 py-3 font-black">Resultado</th>
                    <th className="px-3 py-3 text-right font-black">Importados</th>
                    <th className="px-3 py-3 font-black">Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {sincronizacoes.length === 0 && (
                    <tr>
                      <td className="px-3 py-8 text-center text-slate-400" colSpan={5}>
                        Nenhuma sincronização ainda. Cadastre um certificado e use
                        &quot;Sincronizar NF-e&quot; na tela de NF-e.
                      </td>
                    </tr>
                  )}
                  {sincronizacoes.map((s) => {
                    const falhou = (s.status ?? "").toLowerCase().includes("erro");
                    return (
                      <tr className="border-t border-white/5" key={s.id}>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-400">
                          {formatarMomento(s.data_inicio)}
                        </td>
                        <td className="px-3 py-3 text-slate-200">{s.cliente_nome || "—"}</td>
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
                        <td className="px-3 py-3 text-right text-slate-200">
                          {s.quantidade_importada ?? 0}
                        </td>
                        <td className="px-3 py-3 text-slate-400">{s.mensagem ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </ErpChrome>
  );
}
