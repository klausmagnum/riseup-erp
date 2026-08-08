"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import ConfirmDeleteModal from "@/app/components/ConfirmDeleteModal";
import ErpChrome from "@/app/components/ErpChrome";
import { loadTasks, saveTasks, Tarefa } from "./tarefaStorage";

function formatDate(value: string) {
  if (!value) return "Sem prazo";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function daysLate(value: string, status: Tarefa["status"]) {
  if (!value || status === "Concluida") return 0;
  const today = new Date();
  const due = new Date(`${value}T23:59:59`);
  const diff = Math.ceil((today.getTime() - due.getTime()) / 86400000);
  return Math.max(diff, 0);
}

function statusTone(status: Tarefa["status"]) {
  if (status === "Concluida") return "border-emerald-300/30 bg-emerald-300/10 text-emerald-100";
  if (status === "Aguardando cliente") return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  if (status === "Em andamento") return "border-sky-300/30 bg-sky-300/10 text-sky-100";
  return "border-white/10 bg-white/[0.05] text-slate-200";
}

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

export default function TarefasPage() {
  const [tarefas, setTarefas] = useState<Tarefa[]>(() => loadTasks());
  const [selectedTarefa, setSelectedTarefa] = useState<Tarefa | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState("");

  const filteredTarefas = useMemo(() => {
    const text = search.toLowerCase();
    return tarefas
      .filter((tarefa) => `${tarefa.titulo} ${tarefa.cliente} ${tarefa.clientes.join(" ")} ${tarefa.setor} ${tarefa.responsavel} ${tarefa.status}`.toLowerCase().includes(text))
      .sort((a, b) => a.prazo.localeCompare(b.prazo) || a.titulo.localeCompare(b.titulo, "pt-BR"));
  }, [search, tarefas]);

  const stats = useMemo(() => {
    const atrasadas = tarefas.filter((tarefa) => daysLate(tarefa.prazo, tarefa.status) > 0).length;
    const recorrentes = tarefas.filter((tarefa) => tarefa.tipo === "Recorrente").length;
    const concluidas = tarefas.filter((tarefa) => tarefa.status === "Concluida").length;

    return [
      { label: "Tarefas cadastradas", value: String(tarefas.length), tone: "text-sky-300" },
      { label: "Recorrentes", value: String(recorrentes), tone: "text-violet-300" },
      { label: "Em atraso", value: String(atrasadas), tone: "text-rose-300" },
      { label: "Concluidas", value: String(concluidas), tone: "text-emerald-300" },
    ];
  }, [tarefas]);

  function persist(next: Tarefa[]) {
    setTarefas(next);
    saveTasks(next);
  }

  function deleteTask(id: string) {
    persist(tarefas.filter((tarefa) => tarefa.id !== id));
    setDeleteTargetId(null);
    setFeedback("Tarefa excluída com sucesso.");
  }

  return (
    <ErpChrome>
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-300">Cadastro</p>
        <h1 className="mt-1 text-2xl font-black leading-tight">Tarefas</h1>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
          Cadastre tarefas únicas e recorrentes por cliente, setor, responsável, prazo e subtarefas.
        </p>
      </header>

      <section className="mt-5 grid grid-cols-4 gap-3 max-[980px]:grid-cols-2 max-[560px]:grid-cols-1">
        {stats.map((stat) => (
          <article className="rounded-xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur" key={stat.label}>
            <p className="text-xs text-slate-400">{stat.label}</p>
            <strong className={`mt-2 block text-2xl font-black ${stat.tone}`}>{stat.value}</strong>
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
            <input className="w-full bg-transparent text-xs text-white outline-none placeholder:text-slate-600" onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar tarefa, cliente, obrigação, setor ou responsável" type="search" value={search} />
          </label>
          <Link className="flex min-h-10 items-center justify-center rounded-lg bg-sky-300 px-4 font-sans text-[12px] font-normal leading-none tracking-normal text-slate-950 shadow-[0_18px_42px_rgba(56,189,248,0.20)]" href="/cadastros/tarefas/nova">
            Nova tarefa
          </Link>
        </div>

        {feedback && <p className="mt-3 rounded-lg border border-sky-300/20 bg-sky-300/10 px-3 py-2 text-xs text-sky-100">{feedback}</p>}

        <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
          <div className="grid grid-cols-[minmax(180px,1.4fr)_minmax(150px,1fr)_120px_120px_130px_96px] bg-white/[0.06] text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 max-[1040px]:hidden">
            <span className="px-3 py-3">Tarefa</span>
            <span className="px-3 py-3">Cliente</span>
            <span className="px-3 py-3">Setor</span>
            <span className="px-3 py-3">Prazo</span>
            <span className="px-3 py-3">Status</span>
            <span className="px-3 py-3 text-center">Ações</span>
          </div>

          {filteredTarefas.length === 0 ? (
            <div className="p-5 text-center text-xs text-slate-400">Nenhuma tarefa encontrada.</div>
          ) : (
            <div className="divide-y divide-white/10">
              {filteredTarefas.map((tarefa) => {
                const atraso = daysLate(tarefa.prazo, tarefa.status);

                return (
                  <section className="grid grid-cols-[minmax(180px,1.4fr)_minmax(150px,1fr)_120px_120px_130px_96px] items-center text-xs text-slate-300 max-[1040px]:grid-cols-1 max-[1040px]:gap-2 max-[1040px]:p-3" key={tarefa.id}>
                    <div className="px-3 py-3 max-[1040px]:px-0 max-[1040px]:py-0">
                      <strong className="block text-slate-100">{tarefa.titulo}</strong>
                      <span className="mt-1 block text-[11px] text-slate-500">{tarefa.tipo} · {tarefa.tipo === "Recorrente" ? tarefa.recorrencia : "Sem recorrência"}</span>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {atraso > 0 && <span className="rounded-full border border-rose-300/30 bg-rose-300/10 px-2 py-0.5 text-[10px] font-bold text-rose-100">{atraso} dia(s) de atraso</span>}
                      </div>
                    </div>
                    <span className="px-3 py-3 max-[1040px]:px-0 max-[1040px]:py-0">{tarefa.clientes.join(", ") || tarefa.cliente}</span>
                    <span className="px-3 py-3 max-[1040px]:px-0 max-[1040px]:py-0">{tarefa.setor}</span>
                    <span className="px-3 py-3 max-[1040px]:px-0 max-[1040px]:py-0">{formatDate(tarefa.prazo)}</span>
                    <span className="px-3 py-3 max-[1040px]:px-0 max-[1040px]:py-0">
                      <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${statusTone(tarefa.status)}`}>{tarefa.status}</span>
                    </span>
                    <div className="flex items-center justify-center gap-2 px-3 py-3 max-[1040px]:justify-start max-[1040px]:px-0 max-[1040px]:py-0">
                      <button aria-label="Detalhes" title="Detalhes" onClick={() => setSelectedTarefa(tarefa)} type="button"><ActionIcon type="info" /></button>
                      <Link aria-label="Editar" title="Editar" href={`/cadastros/tarefas/editar?id=${encodeURIComponent(tarefa.id)}`}><ActionIcon type="edit" /></Link>
                      <button aria-label="Excluir" title="Excluir" onClick={() => setDeleteTargetId(tarefa.id)} type="button"><ActionIcon type="delete" /></button>
                    </div>
                    <div className="col-span-full border-t border-white/10 bg-slate-950/25 px-3 py-2 text-[11px] text-slate-500 max-[1040px]:col-auto max-[1040px]:border-t-0 max-[1040px]:px-0">
                      <span className="text-slate-400">Responsável:</span> {tarefa.responsavel}
                      {tarefa.subtarefas.length > 0 && (
                        <>
                          <span className="mx-2 text-slate-700">|</span>
                          <span className="text-slate-400">Subtarefas:</span> {tarefa.subtarefas.length}
                        </>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {selectedTarefa && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
          {/* Altura presa a da janela e rolagem so no meio: com muitas
              subtarefas o conteudo passa da tela, e sem isto ele vazava sem
              rolar — o Fechar ficava fora de alcance. */}
          <section className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col rounded-2xl border border-white/10 bg-[#061020] shadow-2xl shadow-black/40">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 p-5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-300">Detalhes da tarefa</p>
                <h2 className="mt-1 text-xl font-black text-slate-100">{selectedTarefa.titulo}</h2>
              </div>
              <button aria-label="Fechar detalhes" className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 transition hover:border-sky-300/30 hover:text-sky-100" onClick={() => setSelectedTarefa(null)} type="button">
                Fechar
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <div className="grid grid-cols-2 gap-3 text-xs max-[640px]:grid-cols-1">
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <span className="text-slate-500">Tipo</span>
                <strong className="mt-1 block text-slate-100">{selectedTarefa.tipo}</strong>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <span className="text-slate-500">Recorrência</span>
                <strong className="mt-1 block text-slate-100">{selectedTarefa.tipo === "Recorrente" ? selectedTarefa.recorrencia : "Sem recorrência"}</strong>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <span className="text-slate-500">Cliente</span>
                <strong className="mt-1 block text-slate-100">{selectedTarefa.clientes.join(", ") || selectedTarefa.cliente || "Não informado"}</strong>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <span className="text-slate-500">Setor</span>
                <strong className="mt-1 block text-slate-100">{selectedTarefa.setor}</strong>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <span className="text-slate-500">Responsável</span>
                <strong className="mt-1 block text-slate-100">{selectedTarefa.responsavel || "Não informado"}</strong>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <span className="text-slate-500">Prazo</span>
                <strong className="mt-1 block text-slate-100">{formatDate(selectedTarefa.prazo)}</strong>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <span className="text-slate-500">Status</span>
                <strong className="mt-1 block text-slate-100">{selectedTarefa.status}</strong>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <span className="text-slate-500">Data início controle</span>
                <strong className="mt-1 block text-slate-100">{formatDate(selectedTarefa.dataInicio)}</strong>
              </div>
            </div>

            <div className="mt-3 grid gap-3 text-xs">
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <span className="text-slate-500">Subtarefas</span>
                {selectedTarefa.subtarefas.length > 0 ? (
                  <ul className="mt-2 grid gap-1 text-slate-100">
                    {selectedTarefa.subtarefas.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                ) : (
                  <p className="mt-1 text-slate-100">Nenhuma subtarefa cadastrada.</p>
                )}
              </div>
            </div>
            </div>
          </section>
        </div>
      )}

      <ConfirmDeleteModal
        isDeleting={false}
        isOpen={Boolean(deleteTargetId)}
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={() => {
          if (deleteTargetId) deleteTask(deleteTargetId);
        }}
      />
    </ErpChrome>
  );
}
