"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ConfirmDeleteModal from "@/app/components/ConfirmDeleteModal";
import ErpChrome from "@/app/components/ErpChrome";
import { requisitarApi } from "@/app/lib/apiClient";

type Cliente = {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  tipo: string | null;
  matriz_filial: string | null;
  identificacao: string | null;
  regime_tributario: string | null;
  grupo_clientes: string | null;
  municipio: string | null;
  estado: string | null;
  email: string | null;
  contato: string | null;
  status: string | null;
};

type ClientesApiResponse = {
  clientes?: Cliente[];
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

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [search, setSearch] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    async function loadClientes() {
      setIsLoading(true);
      const { ok, result } = await requisitarApi<ClientesApiResponse>("/api/clientes");

      if (!ok) {
        setFeedback(result.error || "Erro ao buscar clientes.");
        setIsLoading(false);
        return;
      }

      setClientes(result.clientes ?? []);
      setIsLoading(false);
    }

    loadClientes();
  }, []);

  const filteredClientes = useMemo(() => {
    return clientes
      .filter((cliente) =>
        `${cliente.razao_social} ${cliente.nome_fantasia} ${cliente.identificacao} ${cliente.regime_tributario} ${cliente.grupo_clientes} ${cliente.municipio} ${cliente.estado}`
          .toLowerCase()
          .includes(search.toLowerCase())
      )
      .sort((a, b) => (a.razao_social || "").localeCompare(b.razao_social || "", "pt-BR"));
  }, [clientes, search]);

  const stats = [
    { label: "Clientes cadastrados", value: String(clientes.length), color: "text-sky-300" },
    { label: "Pessoas juridicas", value: String(clientes.filter((cliente) => cliente.tipo === "Juridica").length), color: "text-violet-300" },
    { label: "Regimes vinculados", value: String(new Set(clientes.map((cliente) => cliente.regime_tributario).filter(Boolean)).size), color: "text-blue-300" },
    { label: "Grupos ativos", value: String(new Set(clientes.map((cliente) => cliente.grupo_clientes).filter(Boolean)).size), color: "text-amber-300" },
  ];

  async function excluirCliente(id: string) {
    setFeedback("");
    setIsDeleting(true);
    const { ok, result } = await requisitarApi<ClientesApiResponse>(`/api/clientes?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    setIsDeleting(false);

    if (!ok) {
      setFeedback(result.error || "Erro ao excluir cliente.");
      return;
    }

    setClientes((current) => current.filter((cliente) => cliente.id !== id));
    setSelectedCliente((current) => (current?.id === id ? null : current));
    setDeleteTargetId(null);
    setFeedback("Cliente excluido com sucesso.");
  }

  return (
    <ErpChrome>
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-300">Cadastro</p>
        <h1 className="mt-1 text-2xl font-black leading-tight">Clientes</h1>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">
          Cadastre, filtre e mantenha os dados que alimentam obrigacoes, tarefas, contatos e controles por competencia.
        </p>
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
            <input className="w-full bg-transparent text-xs text-white outline-none placeholder:text-slate-600" onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar cliente, regime, grupo ou cidade" type="search" value={search} />
          </label>
          <Link className="flex min-h-10 items-center justify-center rounded-lg bg-sky-300 px-4 text-xs font-normal text-slate-950 shadow-[0_18px_42px_rgba(56,189,248,0.20)]" href="/cadastros/clientes/nova">
            Novo cliente
          </Link>
        </div>

        {feedback && <p className="mt-3 rounded-lg border border-sky-300/20 bg-sky-300/10 px-3 py-2 text-xs text-sky-100">{feedback}</p>}

        <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
          {isLoading ? (
            <div className="p-5 text-center text-xs text-slate-400">Carregando clientes do Supabase...</div>
          ) : (
            <table className="w-full table-fixed border-collapse max-[900px]:hidden">
              <colgroup>
                <col className="w-[22%]" />
                <col className="w-[16%]" />
                <col className="w-[14%]" />
                <col className="w-[20%]" />
                <col className="w-[18%]" />
                <col className="w-[10%]" />
              </colgroup>
              <thead className="bg-white/[0.06]">
                <tr className="text-left text-[11px] uppercase text-slate-500">
                  <th className="border-b border-white/10 px-3 py-3 font-black">Razao social</th>
                  <th className="border-b border-white/10 px-3 py-3 font-black">Identificacao</th>
                  <th className="border-b border-white/10 px-3 py-3 font-black">Tipo</th>
                  <th className="border-b border-white/10 px-3 py-3 font-black">Regime tributario</th>
                  <th className="border-b border-white/10 px-3 py-3 font-black">Cidade/UF</th>
                  <th className="border-b border-white/10 px-3 py-3 text-center font-black">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {filteredClientes.map((cliente) => (
                  <tr className="text-xs transition hover:bg-white/[0.035]" key={cliente.id}>
                    <td className="border-b border-white/10 px-3 py-3">
                      <strong className="block truncate text-slate-100">{cliente.razao_social}</strong>
                      <span className="mt-1 block truncate text-[11px] text-slate-500">{cliente.nome_fantasia || "Sem nome fantasia"}</span>
                    </td>
                    <td className="break-words border-b border-white/10 px-3 py-3 text-slate-300">{cliente.identificacao || "Nao informado"}</td>
                    <td className="border-b border-white/10 px-3 py-3 text-slate-300">{cliente.tipo || "Nao informado"}</td>
                    <td className="break-words border-b border-white/10 px-3 py-3 leading-5 text-slate-300">{cliente.regime_tributario || "Nao informado"}</td>
                    <td className="border-b border-white/10 px-3 py-3 text-slate-300">{cliente.municipio || "Sem municipio"} / {cliente.estado || "UF"}</td>
                    <td className="border-b border-white/10 px-3 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button aria-label="Detalhes" title="Detalhes" onClick={() => setSelectedCliente(cliente)} type="button"><ActionIcon type="info" /></button>
                        <Link aria-label="Editar" title="Editar" href={`/cadastros/clientes/editar?id=${cliente.id}`}><ActionIcon type="edit" /></Link>
                        <button aria-label="Excluir" title="Excluir" onClick={() => setDeleteTargetId(cliente.id)} type="button"><ActionIcon type="delete" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!isLoading && filteredClientes.length === 0 && (
            <div className="border-t border-white/10 p-5 text-center text-xs text-slate-400">Nenhum cliente encontrado.</div>
          )}
        </div>

        <footer className="mt-4 text-xs text-slate-500">Exibindo {filteredClientes.length} de {clientes.length} clientes</footer>
      </section>

      {selectedCliente && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/78 px-4 py-6 backdrop-blur-sm">
          <section className="w-full max-w-3xl rounded-2xl border border-white/10 bg-[#061020] p-5 shadow-2xl shadow-black/40">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-300">Detalhes do cliente</p>
                <h2 className="mt-1 text-xl font-black text-slate-100">{selectedCliente.razao_social}</h2>
              </div>
              <button aria-label="Fechar detalhes" className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 transition hover:border-sky-300/30 hover:text-sky-100" onClick={() => setSelectedCliente(null)} type="button">
                Fechar
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 max-[640px]:grid-cols-1">
              {[
                ["Nome fantasia", selectedCliente.nome_fantasia],
                ["Regime tributario", selectedCliente.regime_tributario],
                ["Grupo de clientes", selectedCliente.grupo_clientes],
                ["Contato", selectedCliente.contato],
                ["Email", selectedCliente.email],
                ["Municipio/Estado", `${selectedCliente.municipio || "Sem municipio"} / ${selectedCliente.estado || "UF"}`],
              ].map(([label, value]) => (
                <div className="rounded-xl border border-white/10 bg-white/[0.045] p-3" key={label}>
                  <small className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</small>
                  <p className="mt-1 text-xs leading-5 text-slate-200">{value || "Nao informado"}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
      <ConfirmDeleteModal
        isDeleting={isDeleting}
        isOpen={Boolean(deleteTargetId)}
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={() => {
          if (deleteTargetId) void excluirCliente(deleteTargetId);
        }}
      />
    </ErpChrome>
  );
}
