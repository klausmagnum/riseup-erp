"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ErpChrome from "@/app/components/ErpChrome";
import { supabase } from "@/app/lib/supabaseClient";
import { loadTasks, saveTasks, Tarefa } from "./tarefaStorage";

type ClienteOption = {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  status: string | null;
};

type SetorOption = {
  id: string;
  nome: string;
};

type UsuarioOption = {
  id: string;
  nome: string;
  status: string;
};

type UsuariosApiResponse = {
  usuarios?: UsuarioOption[];
  error?: string;
};

type SetoresApiResponse = {
  setores?: SetorOption[];
  error?: string;
};

const recorrencias: Tarefa["recorrencia"][] = ["Diário", "Semanal", "Quinzenal", "Mensal", "Trimestral", "Anual"];

const emptyForm = {
  titulo: "",
  tipo: "Único" as Tarefa["tipo"],
  recorrencia: "Mensal" as Tarefa["recorrencia"],
  dataInicio: "",
  clientes: [] as string[],
  setor: "",
  responsavel: "",
  prazo: "",
  subtarefas: "",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function inputClass() {
  return "min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none placeholder:text-slate-600";
}

function disabledInputClass(isDisabled: boolean) {
  return `${inputClass()} ${isDisabled ? "cursor-not-allowed border-white/5 bg-slate-900/55 text-slate-600 opacity-70" : ""}`;
}

async function requestAuthenticatedApi<T>(path: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { error: "Sessão não encontrada. Entre novamente no sistema." } as T;
  }

  const response = await fetch(path, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  return response.json().catch(() => ({ error: "Não foi possível carregar os dados." })) as Promise<T>;
}

export default function TarefaForm({ mode, editingId = null }: { mode: "nova" | "editar"; editingId?: string | null }) {
  const router = useRouter();
  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [setores, setSetores] = useState<SetorOption[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioOption[]>([]);
  const initialTask = useMemo(() => {
    if (mode !== "editar" || !editingId) return null;
    return loadTasks().find((item) => item.id === editingId) ?? null;
  }, [editingId, mode]);
  const [form, setForm] = useState(() => initialTask ? {
    titulo: initialTask.titulo,
    tipo: initialTask.tipo,
    recorrencia: initialTask.recorrencia,
    dataInicio: initialTask.dataInicio,
    clientes: initialTask.clientes,
    setor: initialTask.setor,
    responsavel: initialTask.responsavel,
    prazo: initialTask.prazo,
    subtarefas: initialTask.subtarefas.join("\n"),
  } : emptyForm);
  const [feedback, setFeedback] = useState(() => mode === "editar" && editingId && !initialTask ? "Tarefa não encontrada para edição." : "");

  useEffect(() => {
    async function loadOptions() {
      const [{ data: clientesData, error: clientesError }, setoresResult, usuariosResult] = await Promise.all([
        supabase
          .from("clientes")
          .select("id,razao_social,nome_fantasia,status")
          .order("razao_social", { ascending: true }),
        requestAuthenticatedApi<SetoresApiResponse>("/api/setores"),
        requestAuthenticatedApi<UsuariosApiResponse>("/api/usuarios-sistema"),
      ]);

      if (clientesError) {
        setFeedback(`Erro ao buscar clientes: ${clientesError.message}`);
      } else {
        setClientes((clientesData ?? []).filter((cliente) => (cliente.status ?? "").toLowerCase() !== "inativo"));
      }

      if (setoresResult.error) {
        setFeedback(setoresResult.error);
      } else {
        setSetores(setoresResult.setores ?? []);
      }

      if (usuariosResult.error) {
        setFeedback(usuariosResult.error);
      } else {
        setUsuarios((usuariosResult.usuarios ?? []).filter((usuario) => usuario.status !== "Inativo"));
      }
    }

    loadOptions();
  }, []);

  function toggleCliente(nome: string, checked: boolean) {
    setForm((current) => ({
      ...current,
      clientes: checked
        ? Array.from(new Set([...current.clientes, nome]))
        : current.clientes.filter((cliente) => cliente !== nome),
    }));
  }

  function toggleTodosClientes() {
    const todosClientes = clientes.map((cliente) => cliente.razao_social || cliente.nome_fantasia || cliente.id);
    const todosMarcados = todosClientes.length > 0 && todosClientes.every((cliente) => form.clientes.includes(cliente));

    setForm((current) => ({
      ...current,
      clientes: todosMarcados ? [] : todosClientes,
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");

    if (!form.titulo.trim()) {
      setFeedback("Informe o nome da tarefa.");
      return;
    }

    if (form.clientes.length === 0) {
      setFeedback("Selecione ao menos um cliente.");
      return;
    }

    if (!form.responsavel.trim()) {
      setFeedback("Defina um responsável.");
      return;
    }

    if (!form.prazo) {
      setFeedback("Defina um prazo para a tarefa.");
      return;
    }

    if (form.tipo === "Recorrente" && !form.dataInicio) {
      setFeedback("Defina a data de início do controle para a tarefa recorrente.");
      return;
    }

    const tarefas = loadTasks();
    const current = mode === "editar" && editingId ? tarefas.find((item) => item.id === editingId) : null;
    const tarefa: Tarefa = {
      id: current?.id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      titulo: form.titulo.trim(),
      tipo: form.tipo,
      recorrencia: form.recorrencia,
      dataInicio: form.dataInicio || form.prazo,
      cliente: form.clientes.join(", "),
      clientes: form.clientes,
      obrigacao: "Sem obrigação vinculada",
      setor: form.setor,
      responsavel: form.responsavel.trim(),
      prazo: form.prazo,
      prioridade: current?.prioridade ?? "Media",
      status: current?.status ?? "Nova",
      evidenciaObrigatoria: current?.evidenciaObrigatoria ?? "Não obrigatória",
      subtarefas: form.subtarefas.split("\n").map((item) => item.trim()).filter(Boolean),
      anexos: current?.anexos ?? [],
      evidenciaFinalizacao: current?.evidenciaFinalizacao,
      finalizadaEm: current?.finalizadaEm,
    };

    const next = current
      ? tarefas.map((item) => item.id === current.id ? tarefa : item)
      : [tarefa, ...tarefas];

    saveTasks(next);
    router.push("/cadastros/tarefas");
  }

  return (
    <ErpChrome>
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-300">Cadastro / Tarefas</p>
        <h1 className="mt-1 text-2xl font-black leading-tight">{mode === "editar" ? "Editar tarefa" : "Nova tarefa"}</h1>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
          Configure tarefa única ou recorrente com clientes, setor, responsável, prazo e subtarefas.
        </p>
      </header>

      <form className="mt-5 rounded-2xl border border-white/10 bg-[#061020]/88 p-5 shadow-2xl shadow-black/20 backdrop-blur-xl" onSubmit={handleSubmit}>
        {feedback && <p className="mb-4 rounded-lg border border-rose-300/25 bg-rose-300/10 px-3 py-2 text-xs text-rose-100">{feedback}</p>}

        <section className="grid gap-4">
          <Field label="Tarefa">
            <input className={inputClass()} onChange={(event) => setForm((current) => ({ ...current, titulo: event.target.value }))} placeholder="Ex.: Conferir folha de pagamento" value={form.titulo} />
          </Field>

          <fieldset className="grid gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <legend className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Clientes</legend>
              <button
                className="rounded-md border border-white/10 px-2.5 py-1 text-[10px] font-bold text-slate-300 transition hover:border-sky-300/40 hover:text-sky-100"
                onClick={toggleTodosClientes}
                type="button"
              >
                {clientes.length > 0 && clientes.every((cliente) => form.clientes.includes(cliente.razao_social || cliente.nome_fantasia || cliente.id)) ? "Desmarcar todos" : "Marcar todos"}
              </button>
            </div>
            <div className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto rounded-lg border border-white/10 bg-slate-950/60 p-2 max-[720px]:grid-cols-1">
              {clientes.length === 0 && (
                <p className="px-1 py-2 text-xs text-slate-500">Nenhum cliente cadastrado.</p>
              )}
              {clientes.map((cliente) => {
                const nome = cliente.razao_social || cliente.nome_fantasia || cliente.id;

                return (
                  <label className="flex min-h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 text-xs text-slate-300" key={cliente.id}>
                    <input
                      checked={form.clientes.includes(nome)}
                      className="accent-sky-300"
                      onChange={(event) => toggleCliente(nome, event.target.checked)}
                      type="checkbox"
                    />
                    <span>{nome}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="grid grid-cols-3 gap-3 max-[860px]:grid-cols-1">
            <Field label="Tipo">
              <select className={inputClass()} onChange={(event) => setForm((current) => ({ ...current, tipo: event.target.value as Tarefa["tipo"] }))} value={form.tipo}>
                <option>Único</option>
                <option>Recorrente</option>
              </select>
            </Field>
            <Field label="Recorrência">
              <select className={disabledInputClass(form.tipo !== "Recorrente")} disabled={form.tipo !== "Recorrente"} onChange={(event) => setForm((current) => ({ ...current, recorrencia: event.target.value as Tarefa["recorrencia"] }))} value={form.recorrencia}>
                {recorrencias.map((item) => <option key={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="Data início controle">
              <input className={disabledInputClass(form.tipo !== "Recorrente")} disabled={form.tipo !== "Recorrente"} onChange={(event) => setForm((current) => ({ ...current, dataInicio: event.target.value }))} type="date" value={form.dataInicio} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3 max-[860px]:grid-cols-1">
            <Field label="Setor">
              <select className={inputClass()} onChange={(event) => setForm((current) => ({ ...current, setor: event.target.value }))} value={form.setor}>
                <option value="">Selecione o setor</option>
                {setores.map((setor) => <option key={setor.id}>{setor.nome}</option>)}
              </select>
            </Field>
            <Field label="Responsável">
              <select className={inputClass()} onChange={(event) => setForm((current) => ({ ...current, responsavel: event.target.value }))} value={form.responsavel}>
                <option value="">Selecione o responsável</option>
                {usuarios.map((usuario) => <option key={usuario.id}>{usuario.nome}</option>)}
              </select>
            </Field>
            <Field label="Prazo base">
              <input className={inputClass()} onChange={(event) => setForm((current) => ({ ...current, prazo: event.target.value }))} type="date" value={form.prazo} />
            </Field>
          </div>

          <Field label="Subtarefas">
            <textarea className="min-h-28 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 outline-none placeholder:text-slate-600" onChange={(event) => setForm((current) => ({ ...current, subtarefas: event.target.value }))} placeholder={"Uma por linha\nEx.: Conferir eventos"} value={form.subtarefas} />
          </Field>
        </section>

        <div className="mt-6 flex justify-end gap-2 border-t border-white/10 pt-4 max-[560px]:grid">
          <Link className="flex min-h-10 items-center justify-center rounded-lg border border-white/10 px-4 text-xs font-bold text-slate-300 transition hover:border-sky-300/30 hover:text-sky-100" href="/cadastros/tarefas">
            Cancelar
          </Link>
          <button className="min-h-10 rounded-lg bg-sky-300 px-5 text-xs font-black text-slate-950 shadow-[0_18px_42px_rgba(56,189,248,0.20)]" type="submit">
            {mode === "editar" ? "Atualizar tarefa" : "Salvar tarefa"}
          </button>
        </div>
      </form>
    </ErpChrome>
  );
}

