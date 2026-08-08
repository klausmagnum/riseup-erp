"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ConfirmDeleteModal from "@/app/components/ConfirmDeleteModal";
import ErpChrome from "@/app/components/ErpChrome";
import { supabase } from "@/app/lib/supabaseClient";

type Obrigacao = {
  id: string;
  nome: string;
  validacao: boolean;
  regime: string;
  periodicidade: string;
  prazo: string;
  setor: string;
  status: string;
};

type ObrigacoesApiResponse = {
  obrigacoes?: Obrigacao[];
  error?: string;
};

function ActionIcon({ type }: { type: "info" | "edit" | "delete" }) {
  const paths = {
    info: <><path d="M12 17v-5" /><path d="M12 8h.01" /><path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20" /></>,
    edit: <><path d="M12 20h9" /><path d="m16.5 3.5 4 4L8 20H4v-4z" /></>,
    delete: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
  };

  return (
    <svg className={`size-4 ${type === "delete" ? "text-rose-400" : "text-slate-300"} transition hover:text-sky-300`} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      {paths[type]}
    </svg>
  );
}

async function requestObrigacoesApi(path = "/api/obrigacoes", init: RequestInit = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return {
      response: null,
      result: { error: "Sessão não encontrada. Entre novamente no sistema." } as ObrigacoesApiResponse,
    };
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, { ...init, headers });
  const result = await response.json().catch(() => ({} as ObrigacoesApiResponse));
  return { response, result };
}

export default function ObrigacoesPage() {
  const [obrigacoes, setObrigacoes] = useState<Obrigacao[]>([]);
  const [selectedObrigacao, setSelectedObrigacao] = useState<Obrigacao | null>(null);
  const [search, setSearch] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    async function loadObrigacoes() {
      setIsLoading(true);
      const { response, result } = await requestObrigacoesApi();

      if (!response?.ok) {
        setFeedback(result.error || "Erro ao buscar obrigações.");
        setIsLoading(false);
        return;
      }

      setObrigacoes(result.obrigacoes ?? []);
      setIsLoading(false);
    }

    loadObrigacoes();
  }, []);

  const filteredObrigacoes = useMemo(() => {
    return obrigacoes
      .filter((obrigacao) =>
        `${obrigacao.nome} ${obrigacao.regime} ${obrigacao.setor} ${obrigacao.periodicidade}`.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
  }, [obrigacoes, search]);

  const stats = [
    { label: "Obrigações cadastradas", value: String(obrigacoes.length), color: "text-sky-300" },
    { label: "Com validação", value: String(obrigacoes.filter((obrigacao) => obrigacao.validacao).length), color: "text-violet-300" },
    { label: "Setores vinculados", value: String(new Set(obrigacoes.map((obrigacao) => obrigacao.setor)).size), color: "text-blue-300" },
    { label: "Inativas ocultas", value: String(obrigacoes.filter((obrigacao) => obrigacao.status === "Inativo").length), color: "text-amber-300" },
  ];

  async function excluirObrigacao(id: string) {
    setFeedback("");
    setIsDeleting(true);
    const { response, result } = await requestObrigacoesApi(`/api/obrigacoes?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    setIsDeleting(false);

    if (!response?.ok) {
      setFeedback(result.error || "Erro ao excluir obrigação.");
      return;
    }

    setObrigacoes((current) => current.filter((obrigacao) => obrigacao.id !== id));
    setSelectedObrigacao((current) => (current?.id === id ? null : current));
    setDeleteTargetId(null);
    setFeedback("Obrigacao excluida com sucesso.");
  }

  return (
    <ErpChrome>
      <header>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-300">Cadastro</p>
          <h1 className="mt-1 text-2xl font-black leading-tight">Obrigações fiscais e contábeis</h1>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">
            Cadastre, filtre e mantenha as obrigações que alimentam as rotinas recorrentes, agenda fiscal, SLA e checklists do ERP.
          </p>
        </div>
      </header>

      <section className="mt-5 grid grid-cols-4 gap-3 max-[980px]:grid-cols-2 max-[560px]:grid-cols-1">
        {stats.map((stat) => (
          <article className="rounded-xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur" key={stat.label}>
            <p className="text-xs text-slate-400">{stat.label}</p>
            <strong className={`mt-2 block text-2xl font-black ${stat.color}`}>{stat.value}</strong>
          </article>
        ))}
      </section>

      <section className="mt-4 rounded-2xl border border-white/10 bg-[#061020]/88 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
        <div className="grid grid-cols-[minmax(0,1fr)_200px] gap-3 max-[720px]:grid-cols-1">
          <label className="flex min-h-10 items-center gap-2 rounded-lg border border-white/10 bg-slate-950/60 px-3">
            <svg className="size-4 text-sky-300" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="m21 21-4.3-4.3" strokeLinecap="round" />
              <path d="M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14" />
            </svg>
            <input className="w-full bg-transparent text-xs text-white outline-none placeholder:text-slate-600" onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar obrigação, regime, setor ou periodicidade" type="search" value={search} />
          </label>
          <Link className="flex min-h-10 items-center justify-center rounded-lg bg-sky-300 px-4 font-sans text-[12px] font-normal leading-none tracking-normal text-slate-950 shadow-[0_18px_42px_rgba(56,189,248,0.20)]" href="/cadastros/obrigacoes/nova">
            Nova obrigação
          </Link>
        </div>

        {feedback && <p className="mt-3 rounded-lg border border-sky-300/20 bg-sky-300/10 px-3 py-2 text-xs text-sky-100">{feedback}</p>}

        <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
          {isLoading ? (
            <div className="p-5 text-center text-xs text-slate-400">Carregando obrigações do Supabase...</div>
          ) : (
            <table className="w-full table-fixed border-collapse max-[900px]:hidden">
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[38%]" />
                <col className="w-[13%]" />
                <col className="w-[11%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
              </colgroup>
              <thead className="bg-white/[0.06]">
                <tr className="text-left text-[11px] uppercase text-slate-500">
                  <th className="border-b border-white/10 px-3 py-3 font-black">Nome</th>
                  <th className="border-b border-white/10 px-3 py-3 font-black">Regime Tributario</th>
                  <th className="border-b border-white/10 px-3 py-3 font-black">Periodicidade</th>
                  <th className="border-b border-white/10 px-3 py-3 font-black">Prazo</th>
                  <th className="border-b border-white/10 px-3 py-3 font-black">Setor</th>
                  <th className="border-b border-white/10 px-3 py-3 text-center font-black">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredObrigacoes.map((obrigacao) => (
                  <tr className="text-xs transition hover:bg-white/[0.035]" key={obrigacao.id}>
                    <td className="border-b border-white/10 px-3 py-3"><strong className="text-slate-100">{obrigacao.nome}</strong></td>
                    <td className="break-words border-b border-white/10 px-3 py-3 leading-5 text-slate-300">{obrigacao.regime}</td>
                    <td className="break-words border-b border-white/10 px-3 py-3 text-slate-300">{obrigacao.periodicidade}</td>
                    <td className="break-words border-b border-white/10 px-3 py-3 text-slate-300">{obrigacao.prazo}</td>
                    <td className="border-b border-white/10 px-3 py-3">
                      <span className="inline-flex max-w-full rounded-full border border-violet-300/25 bg-violet-300/10 px-2 py-1 text-[10px] font-bold text-violet-200">{obrigacao.setor}</span>
                    </td>
                    <td className="border-b border-white/10 px-3 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button aria-label="Detalhes" title="Detalhes" className="group relative" onClick={() => setSelectedObrigacao(obrigacao)} type="button"><ActionIcon type="info" /></button>
                        <Link aria-label="Editar" title="Editar" className="group relative" href={`/cadastros/obrigacoes/editar?id=${obrigacao.id}`}><ActionIcon type="edit" /></Link>
                        <button aria-label="Excluir" title="Excluir" onClick={() => setDeleteTargetId(obrigacao.id)} type="button"><ActionIcon type="delete" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <footer className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500 max-[640px]:flex-col">
          <span>Exibindo {filteredObrigacoes.length} de {obrigacoes.length} obrigações</span>
        </footer>
      </section>

      {selectedObrigacao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/78 px-4 py-6 backdrop-blur-sm">
          {/* Altura presa a da tela, cabecalho fixo e rolagem so no corpo: sem
              isto o modal vaza em tela baixa e o Fechar sai de alcance. */}
          <section className="flex max-h-[calc(100dvh-3rem)] w-full max-w-2xl flex-col rounded-2xl border border-white/10 bg-[#061020] shadow-2xl shadow-black/40">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 p-5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-300">Detalhes da obrigação</p>
                <h2 className="mt-1 text-xl font-black text-slate-100">{selectedObrigacao.nome}</h2>
              </div>
              <button aria-label="Fechar detalhes" className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 transition hover:border-sky-300/30 hover:text-sky-100" onClick={() => setSelectedObrigacao(null)} type="button">
                Fechar
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <div className="grid grid-cols-2 gap-3 max-[640px]:grid-cols-1">
              <div className="rounded-xl border border-white/10 bg-white/[0.045] p-3"><small className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Regime tributário</small><p className="mt-1 text-xs leading-5 text-slate-200">{selectedObrigacao.regime}</p></div>
              <div className="rounded-xl border border-white/10 bg-white/[0.045] p-3"><small className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Setor responsável</small><p className="mt-1 text-xs text-slate-200">{selectedObrigacao.setor}</p></div>
              <div className="rounded-xl border border-white/10 bg-white/[0.045] p-3"><small className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Periodicidade</small><p className="mt-1 text-xs text-slate-200">{selectedObrigacao.periodicidade}</p></div>
              <div className="rounded-xl border border-white/10 bg-white/[0.045] p-3"><small className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Prazo de vencimento</small><p className="mt-1 text-xs text-slate-200">{selectedObrigacao.prazo}</p></div>
            </div>
            </div>
          </section>
        </div>
      )}
      <ConfirmDeleteModal
        isDeleting={isDeleting}
        isOpen={Boolean(deleteTargetId)}
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={() => {
          if (deleteTargetId) void excluirObrigacao(deleteTargetId);
        }}
      />
    </ErpChrome>
  );
}
