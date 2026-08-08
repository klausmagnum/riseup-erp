"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import ConfirmDeleteModal from "@/app/components/ConfirmDeleteModal";
import ErpChrome from "@/app/components/ErpChrome";
import { currentUserStorageKey } from "@/app/components/TopbarUser";
import { requisitarApi } from "@/app/lib/apiClient";
import {
  gerarAgendaPessoal,
  inicioDoDia,
  lerDataIso,
  nomeDoCliente,
  prioridadesTarefaPessoal,
  recorrenciasTarefaPessoal,
  resolverClientesDaTarefa,
  formatarDataBr,
  type ClienteDaTarefa,
  type OcorrenciaTarefaPessoal,
  type PrioridadeTarefaPessoal,
  type RecorrenciaTarefaPessoal,
  type TarefaPessoal,
  type TarefasPessoaisApiResponse,
  type TipoTarefaPessoal,
} from "@/app/lib/tarefasPessoais";

/** Para quem a tarefa vale. Guardado como as duas listas; aqui e so a escolha da tela. */
type Alvo = "nenhum" | "clientes" | "regimes";

type Formulario = {
  titulo: string;
  descricao: string;
  tipo: TipoTarefaPessoal;
  recorrencia: RecorrenciaTarefaPessoal;
  prazo: string;
  prioridade: PrioridadeTarefaPessoal;
  alvo: Alvo;
  clientes: string[];
  regimes: string[];
};

type Feedback = { tipo: "erro" | "ok"; texto: string } | null;

const formularioVazio: Formulario = {
  titulo: "",
  descricao: "",
  tipo: "Recorrente",
  recorrencia: "Mensal",
  prazo: "",
  prioridade: "Media",
  alvo: "nenhum",
  clientes: [],
  regimes: [],
};

function tomDoPrazo(dias: number) {
  if (dias < 0) return "border-rose-300/25 bg-rose-300/10 text-rose-200";
  if (dias <= 5) return "border-amber-300/25 bg-amber-300/10 text-amber-200";
  return "border-emerald-300/25 bg-emerald-300/10 text-emerald-200";
}

function textoDoPrazo(dias: number) {
  if (dias < 0) return `Atrasada há ${Math.abs(dias)} dia(s)`;
  if (dias === 0) return "É para hoje";
  return `Faltam ${dias} dia(s)`;
}

function tomDaPrioridade(prioridade: PrioridadeTarefaPessoal) {
  if (prioridade === "Critica") return "border-rose-300/25 bg-rose-300/10 text-rose-100";
  if (prioridade === "Alta") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  if (prioridade === "Baixa") return "border-white/10 bg-white/[0.05] text-slate-300";
  return "border-sky-300/25 bg-sky-300/10 text-sky-100";
}

function campoClass() {
  return "min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none placeholder:text-slate-600";
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

/** Regimes que existem no cadastro de clientes, com quantos clientes ativos tem cada um. */
function regimesDisponiveis(clientes: ClienteDaTarefa[]) {
  const contagem = clientes
    .filter((cliente) => (cliente.status ?? "").toLowerCase() !== "inativo")
    .reduce<Record<string, number>>((mapa, cliente) => {
      const regime = (cliente.regime_tributario ?? "").trim();
      if (!regime) return mapa;

      mapa[regime] = (mapa[regime] ?? 0) + 1;
      return mapa;
    }, {});

  return Object.entries(contagem).sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
}

/** Primeiro nome de quem esta logado, guardado no login junto da sessao. */
function primeiroNomeDoUsuario() {
  try {
    const guardado = window.localStorage.getItem(currentUserStorageKey);
    const usuario = guardado ? JSON.parse(guardado) as { nome?: string } : null;
    return (usuario?.nome ?? "").trim().split(" ")[0] || "Usuário";
  } catch {
    return "Usuário";
  }
}

export default function MyDesktop() {
  const [userName, setUserName] = useState("");
  const [tarefas, setTarefas] = useState<TarefaPessoal[]>([]);
  const [clientes, setClientes] = useState<ClienteDaTarefa[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busca, setBusca] = useState("");
  const [formAberto, setFormAberto] = useState(false);
  const [tarefaEmEdicao, setTarefaEmEdicao] = useState<TarefaPessoal | null>(null);
  const [formulario, setFormulario] = useState<Formulario>(formularioVazio);
  const [salvando, setSalvando] = useState(false);
  const [tarefaParaExcluir, setTarefaParaExcluir] = useState<TarefaPessoal | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [ocorrenciaAberta, setOcorrenciaAberta] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<{ ocorrencia: OcorrenciaTarefaPessoal; cliente: ClienteDaTarefa | null } | null>(null);
  // Cada incremento refaz a carga: quem salva, exclui ou concluiu por fora so
  // precisa pedir a releitura, sem repetir a chamada da API.
  const [recarga, setRecarga] = useState(0);
  const hoje = useMemo(() => inicioDoDia(new Date()), []);

  useEffect(() => {
    let ativo = true;

    async function carregarTarefas() {
      const { ok, result } = await requisitarApi<TarefasPessoaisApiResponse>("/api/tarefas-pessoais");
      if (!ativo) return;

      if (!ok) {
        setFeedback({ tipo: "erro", texto: result.error || "Não foi possível carregar suas tarefas." });
      } else {
        setTarefas(result.tarefas ?? []);
        setClientes(result.clientes ?? []);
      }

      // O nome sai do storage do login e so existe no browser, por isso e lido
      // aqui e nao no estado inicial da tela.
      setUserName(primeiroNomeDoUsuario());
      setIsLoading(false);
    }

    carregarTarefas();

    return () => {
      ativo = false;
    };
  }, [recarga]);

  const agenda = useMemo(() => gerarAgendaPessoal(tarefas, clientes, hoje), [clientes, hoje, tarefas]);

  const agendaFiltrada = useMemo(() => {
    const texto = busca.trim().toLowerCase();
    if (!texto) return agenda;

    return agenda.filter((ocorrencia) => {
      const nomesDosClientes = ocorrencia.clientesPendentes.map(nomeDoCliente).join(" ");
      return `${ocorrencia.tarefa.titulo} ${ocorrencia.tarefa.descricao ?? ""} ${ocorrencia.dataLabel} ${nomesDosClientes}`
        .toLowerCase()
        .includes(texto);
    });
  }, [agenda, busca]);

  const regimes = useMemo(() => regimesDisponiveis(clientes), [clientes]);
  const clientesAtivos = useMemo(
    () => clientes.filter((cliente) => (cliente.status ?? "").toLowerCase() !== "inativo"),
    [clientes]
  );

  const agrupadaPorData = useMemo(() => {
    return agendaFiltrada.reduce<Record<string, OcorrenciaTarefaPessoal[]>>((grupos, ocorrencia) => {
      const chave = `${ocorrencia.dataChave}|${ocorrencia.dataLabel}`;
      grupos[chave] = grupos[chave] ?? [];
      grupos[chave].push(ocorrencia);
      return grupos;
    }, {});
  }, [agendaFiltrada]);

  const resumo = useMemo(() => {
    const paraHoje = agenda.filter((ocorrencia) => ocorrencia.diasAteVencer === 0).length;
    const atrasadas = agenda.filter((ocorrencia) => ocorrencia.diasAteVencer < 0).length;
    const proximosSete = agenda.filter((ocorrencia) => ocorrencia.diasAteVencer > 0 && ocorrencia.diasAteVencer <= 7).length;

    return [
      { label: "Para hoje", valor: String(paraHoje), dica: formatarDataBr(hoje), tom: "text-sky-300" },
      { label: "Atrasadas", valor: String(atrasadas), dica: "Passaram do dia", tom: "text-rose-300" },
      { label: "Próximos 7 dias", valor: String(proximosSete), dica: "Já entram na agenda", tom: "text-amber-300" },
      { label: "Tarefas cadastradas", valor: String(tarefas.length), dica: "Só você enxerga", tom: "text-violet-300" },
    ];
  }, [agenda, hoje, tarefas.length]);

  function abrirNova() {
    setTarefaEmEdicao(null);
    setFormulario(formularioVazio);
    setFormAberto(true);
    setFeedback(null);
  }

  function abrirEdicao(tarefa: TarefaPessoal) {
    setTarefaEmEdicao(tarefa);
    setFormulario({
      titulo: tarefa.titulo,
      descricao: tarefa.descricao ?? "",
      tipo: tarefa.tipo,
      recorrencia: tarefa.recorrencia,
      prazo: tarefa.prazo,
      prioridade: tarefa.prioridade,
      // O alvo nao e coluna: sai do que a tarefa tem guardado.
      alvo: tarefa.regimes.length > 0 ? "regimes" : tarefa.clientes.length > 0 ? "clientes" : "nenhum",
      clientes: tarefa.clientes,
      regimes: tarefa.regimes,
    });
    setFormAberto(true);
    setFeedback(null);
  }

  function alternarCliente(id: string, marcado: boolean) {
    setFormulario((atual) => ({
      ...atual,
      clientes: marcado ? Array.from(new Set([...atual.clientes, id])) : atual.clientes.filter((item) => item !== id),
    }));
  }

  function alternarTodosOsClientes() {
    setFormulario((atual) => ({
      ...atual,
      clientes: atual.clientes.length === clientesAtivos.length ? [] : clientesAtivos.map((cliente) => cliente.id),
    }));
  }

  function alternarRegime(regime: string, marcado: boolean) {
    setFormulario((atual) => ({
      ...atual,
      regimes: marcado ? Array.from(new Set([...atual.regimes, regime])) : atual.regimes.filter((item) => item !== regime),
    }));
  }

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    if (!formulario.titulo.trim()) {
      setFeedback({ tipo: "erro", texto: "Informe o nome da tarefa." });
      return;
    }

    if (!formulario.prazo) {
      setFeedback({ tipo: "erro", texto: "Informe a data da tarefa." });
      return;
    }

    if (formulario.alvo === "clientes" && formulario.clientes.length === 0) {
      setFeedback({ tipo: "erro", texto: "Escolha ao menos um cliente ou volte para “Só a tarefa”." });
      return;
    }

    if (formulario.alvo === "regimes" && formulario.regimes.length === 0) {
      setFeedback({ tipo: "erro", texto: "Escolha ao menos um regime ou volte para “Só a tarefa”." });
      return;
    }

    setSalvando(true);
    // O alvo decide qual das duas listas vai: trocar de "clientes" para
    // "regimes" na edicao tem que limpar a lista anterior.
    const payload = {
      ...formulario,
      clientes: formulario.alvo === "clientes" ? formulario.clientes : [],
      regimes: formulario.alvo === "regimes" ? formulario.regimes : [],
    };
    const corpo = tarefaEmEdicao
      ? JSON.stringify({ id: tarefaEmEdicao.id, payload })
      : JSON.stringify(payload);

    const { ok, result } = await requisitarApi<TarefasPessoaisApiResponse>("/api/tarefas-pessoais", {
      method: tarefaEmEdicao ? "PATCH" : "POST",
      body: corpo,
    });
    setSalvando(false);

    if (!ok) {
      setFeedback({ tipo: "erro", texto: result.error || "Não foi possível salvar a tarefa." });
      return;
    }

    setFormAberto(false);
    setTarefaEmEdicao(null);
    setFormulario(formularioVazio);
    setFeedback({ tipo: "ok", texto: tarefaEmEdicao ? "Tarefa atualizada." : "Tarefa cadastrada e já na sua agenda." });
    setRecarga((atual) => atual + 1);
  }

  async function concluir(ocorrencia: OcorrenciaTarefaPessoal, cliente: ClienteDaTarefa | null) {
    // A tela responde na hora e o servidor confirma depois: se falhar, a tarefa
    // volta para a agenda junto com o aviso.
    setTarefas((atual) =>
      atual.map((tarefa) =>
        tarefa.id === ocorrencia.tarefa.id
          ? { ...tarefa, conclusoes: [...tarefa.conclusoes, { data: ocorrencia.dataChave, clienteId: cliente?.id ?? null }] }
          : tarefa
      )
    );

    const { ok, result } = await requisitarApi<{ error?: string }>("/api/tarefas-pessoais/conclusoes", {
      method: "POST",
      body: JSON.stringify({ tarefaId: ocorrencia.tarefa.id, data: ocorrencia.dataChave, clienteId: cliente?.id ?? null }),
    });

    if (!ok) {
      setFeedback({ tipo: "erro", texto: result.error || "Não foi possível concluir a tarefa." });
      setRecarga((atual) => atual + 1);
      return;
    }

    setFeedback({
      tipo: "ok",
      texto: cliente
        ? `"${ocorrencia.tarefa.titulo}" finalizada para ${nomeDoCliente(cliente)} em ${ocorrencia.dataLabel}.`
        : `"${ocorrencia.tarefa.titulo}" concluída em ${ocorrencia.dataLabel}.`,
    });
  }

  async function excluir() {
    if (!tarefaParaExcluir) return;

    setExcluindo(true);
    const { ok, result } = await requisitarApi<{ error?: string }>(
      `/api/tarefas-pessoais?id=${encodeURIComponent(tarefaParaExcluir.id)}`,
      { method: "DELETE" }
    );
    setExcluindo(false);
    setTarefaParaExcluir(null);

    if (!ok) {
      setFeedback({ tipo: "erro", texto: result.error || "Não foi possível excluir a tarefa." });
      return;
    }

    setFeedback({ tipo: "ok", texto: "Tarefa excluída." });
    setRecarga((atual) => atual + 1);
  }

  return (
    <ErpChrome>
      <header className="flex items-end justify-between gap-4 max-[760px]:flex-col max-[760px]:items-start">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-300">My Desktop</p>
          <h1 className="mt-1 text-2xl font-black leading-tight">Olá, {userName}! 👋</h1>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
            Aqui ficam as tarefas da sua rotina. Elas entram na agenda de obrigações do dashboard na data certa, junto das
            obrigações do escritório — e só você enxerga as suas.
          </p>
        </div>
        <button
          className="min-h-10 shrink-0 rounded-lg bg-sky-300 px-5 text-xs font-black text-slate-950 shadow-[0_18px_42px_rgba(56,189,248,0.20)] transition hover:bg-sky-200"
          onClick={abrirNova}
          type="button"
        >
          + Nova tarefa
        </button>
      </header>

      <section className="mt-5 grid grid-cols-4 gap-3 max-[980px]:grid-cols-2 max-[560px]:grid-cols-1">
        {resumo.map((item) => (
          <article className="rounded-xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur" key={item.label}>
            <p className="text-xs text-slate-400">{item.label}</p>
            <strong className={`mt-2 block text-2xl font-black ${item.tom}`}>{item.valor}</strong>
            <span className="mt-1 block text-[11px] text-slate-500">{item.dica}</span>
          </article>
        ))}
      </section>

      {feedback && (
        <p
          className={`mt-4 rounded-lg border px-3 py-2 text-xs ${
            feedback.tipo === "erro"
              ? "border-rose-300/25 bg-rose-300/10 text-rose-100"
              : "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
          }`}
        >
          {feedback.texto}
        </p>
      )}

      <section className="mt-4 rounded-2xl border border-white/10 bg-[#061020]/88 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3 max-[760px]:flex-col">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-300">Minha agenda</p>
            <h2 className="mt-1 text-lg font-black">Suas tarefas por data</h2>
            <p className="mt-1 text-xs text-slate-400">
              Mesma leitura da agenda de obrigações: dia a dia, do mais próximo ao mais distante, até três meses à frente.
            </p>
          </div>
        </div>

        <label className="mt-4 flex min-h-10 items-center gap-2 rounded-lg border border-white/10 bg-slate-950/60 px-3">
          <svg className="size-4 text-sky-300" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="m21 21-4.3-4.3" strokeLinecap="round" />
            <path d="M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14" />
          </svg>
          <input
            className="w-full bg-transparent text-xs text-white outline-none placeholder:text-slate-600"
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="Buscar tarefa ou data"
            type="search"
            value={busca}
          />
        </label>

        <div className="mt-4 max-h-[560px] overflow-auto rounded-xl border border-white/10 bg-slate-950/45">
          {isLoading ? (
            <div className="p-6 text-center text-xs text-slate-400">Carregando suas tarefas...</div>
          ) : Object.keys(agrupadaPorData).length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              {tarefas.length === 0
                ? "Você ainda não cadastrou tarefas. Use o botão “Nova tarefa” para começar."
                : "Nenhuma tarefa pendente para os filtros atuais."}
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {Object.entries(agrupadaPorData).map(([chaveDaData, ocorrencias]) => {
                const [, dataLabel] = chaveDaData.split("|");
                const dias = ocorrencias[0].diasAteVencer;

                return (
                  <section className="p-3" key={chaveDaData}>
                    <div className="sticky top-0 z-10 -mx-3 -mt-3 flex items-center gap-2 border-b border-white/10 bg-[#061020]/95 px-3 py-2 backdrop-blur">
                      <span className={`grid size-7 place-items-center rounded-full border text-[11px] font-black ${tomDoPrazo(dias)}`}>
                        {ocorrencias.length}
                      </span>
                      <div>
                        <strong className="block text-xs text-slate-100">{dataLabel}</strong>
                        <span className="text-[11px] text-slate-500">{textoDoPrazo(dias)}</span>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2">
                      {ocorrencias.map((ocorrencia) => {
                        const temClientes = ocorrencia.totalDeClientes > 0;
                        const aberta = ocorrenciaAberta === ocorrencia.chave;
                        const fundo =
                          ocorrencia.diasAteVencer < 0
                            ? "bg-rose-300/15"
                            : ocorrencia.diasAteVencer <= 5
                              ? "bg-amber-300/15"
                              : "bg-white/[0.035]";

                        const cabecalho = (
                          <>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                {temClientes && (
                                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-violet-300 text-[10px] font-black text-slate-950">
                                    {aberta ? "-" : "+"}
                                  </span>
                                )}
                                <strong className="truncate text-xs text-slate-100">{ocorrencia.tarefa.titulo}</strong>
                                <span className="rounded-full border border-violet-300/25 bg-violet-300/10 px-2 py-0.5 text-[10px] font-bold text-violet-100">
                                  {ocorrencia.tarefa.tipo === "Recorrente" ? ocorrencia.tarefa.recorrencia : "Única"}
                                </span>
                                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${tomDaPrioridade(ocorrencia.tarefa.prioridade)}`}>
                                  {ocorrencia.tarefa.prioridade}
                                </span>
                                {temClientes && (
                                  <span className="rounded-full border border-white/10 bg-slate-950/65 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                                    {ocorrencia.clientesPendentes.length} cliente(s)
                                  </span>
                                )}
                              </div>
                              {ocorrencia.tarefa.descricao && (
                                <p className="mt-1 line-clamp-2 text-[11px] text-slate-400">{ocorrencia.tarefa.descricao}</p>
                              )}
                            </div>

                            <div className="flex items-center justify-end gap-2 max-[720px]:justify-start">
                              <span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${tomDoPrazo(ocorrencia.diasAteVencer)}`}>
                                {textoDoPrazo(ocorrencia.diasAteVencer)}
                              </span>
                              {!temClientes && (
                                <button
                                  className="min-h-8 rounded-md bg-emerald-300 px-3 text-[10px] font-black text-slate-950 transition hover:bg-emerald-200"
                                  onClick={() => setConfirmacao({ ocorrencia, cliente: null })}
                                  type="button"
                                >
                                  Concluir
                                </button>
                              )}
                            </div>
                          </>
                        );

                        // Sem cliente a tarefa e uma linha so. Com clientes ela
                        // abre a lista, do mesmo jeito que a obrigacao abre as
                        // empresas: finaliza um por um, com confirmacao.
                        if (!temClientes) {
                          return (
                            <article
                              className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-white/10 px-3 py-2.5 max-[720px]:grid-cols-1 ${fundo}`}
                              key={ocorrencia.chave}
                            >
                              {cabecalho}
                            </article>
                          );
                        }

                        return (
                          <section className="rounded-lg border border-white/10 bg-slate-950/25" key={ocorrencia.chave}>
                            <button
                              className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:brightness-125 max-[720px]:grid-cols-1 ${fundo}`}
                              onClick={() => setOcorrenciaAberta((atual) => (atual === ocorrencia.chave ? null : ocorrencia.chave))}
                              type="button"
                            >
                              {cabecalho}
                            </button>

                            {aberta && (
                              <div className="grid gap-2 border-t border-white/10 bg-slate-950/45 p-3">
                                {ocorrencia.clientesPendentes.map((cliente) => (
                                  <div
                                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 max-[640px]:grid-cols-1"
                                    key={cliente.id}
                                  >
                                    <div className="min-w-0">
                                      <strong className="block truncate text-xs text-slate-100">{nomeDoCliente(cliente)}</strong>
                                      <span className="mt-1 block truncate text-[11px] text-slate-500">
                                        {cliente.identificacao || "Sem identificação"} - {cliente.regime_tributario || "Sem regime"}
                                      </span>
                                    </div>
                                    <button
                                      className="min-h-7 rounded-md bg-emerald-300 px-2.5 text-[10px] font-black text-slate-950 transition hover:bg-emerald-200"
                                      onClick={() => setConfirmacao({ ocorrencia, cliente })}
                                      type="button"
                                    >
                                      Finalizar
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </section>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-white/10 bg-[#061020]/88 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3 max-[640px]:flex-col">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-300">Cadastro</p>
            <h2 className="mt-1 text-lg font-black">Minhas tarefas cadastradas</h2>
            <p className="mt-1 text-xs text-slate-400">Edite a data, a recorrência ou remova o que não faz mais parte da rotina.</p>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
          <div className="grid grid-cols-[minmax(180px,1.4fr)_minmax(140px,1fr)_120px_120px_110px_120px] bg-white/[0.06] text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 max-[1100px]:hidden">
            <span className="px-3 py-3">Tarefa</span>
            <span className="px-3 py-3">Para quem</span>
            <span className="px-3 py-3">Quando</span>
            <span className="px-3 py-3">Data base</span>
            <span className="px-3 py-3">Prioridade</span>
            <span className="px-3 py-3 text-center">Ações</span>
          </div>

          {isLoading ? (
            <div className="p-5 text-center text-xs text-slate-400">Carregando...</div>
          ) : tarefas.length === 0 ? (
            <div className="p-5 text-center text-xs text-slate-400">Nenhuma tarefa cadastrada por você.</div>
          ) : (
            <div className="divide-y divide-white/10">
              {tarefas.map((tarefa) => {
                const dataBase = lerDataIso(tarefa.prazo);
                const clientesDaTarefa = resolverClientesDaTarefa(tarefa, clientes);

                return (
                  <section
                    className="grid grid-cols-[minmax(180px,1.4fr)_minmax(140px,1fr)_120px_120px_110px_120px] items-center text-xs text-slate-300 max-[1100px]:grid-cols-1 max-[1100px]:gap-2 max-[1100px]:p-3"
                    key={tarefa.id}
                  >
                    <div className="px-3 py-3 max-[1100px]:px-0 max-[1100px]:py-0">
                      <strong className="block text-slate-100">{tarefa.titulo}</strong>
                      {tarefa.descricao && <span className="mt-1 block text-[11px] text-slate-500">{tarefa.descricao}</span>}
                    </div>
                    <div className="px-3 py-3 max-[1100px]:px-0 max-[1100px]:py-0">
                      {tarefa.regimes.length > 0 ? (
                        <>
                          <strong className="block text-slate-100">{tarefa.regimes.join(", ")}</strong>
                          <span className="mt-1 block text-[11px] text-slate-500">{clientesDaTarefa.length} cliente(s) hoje</span>
                        </>
                      ) : clientesDaTarefa.length > 0 ? (
                        <>
                          <strong className="block text-slate-100">{clientesDaTarefa.length} cliente(s)</strong>
                          <span className="mt-1 block truncate text-[11px] text-slate-500" title={clientesDaTarefa.map(nomeDoCliente).join(", ")}>
                            {clientesDaTarefa.map(nomeDoCliente).join(", ")}
                          </span>
                        </>
                      ) : (
                        <span className="text-slate-500">Só a tarefa</span>
                      )}
                    </div>
                    <span className="px-3 py-3 max-[1100px]:px-0 max-[1100px]:py-0">
                      {tarefa.tipo === "Recorrente" ? tarefa.recorrencia : "Uma vez"}
                    </span>
                    <span className="px-3 py-3 max-[1100px]:px-0 max-[1100px]:py-0">
                      {dataBase ? formatarDataBr(dataBase) : "Sem data"}
                    </span>
                    <span className="px-3 py-3 max-[1100px]:px-0 max-[1100px]:py-0">
                      <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${tomDaPrioridade(tarefa.prioridade)}`}>
                        {tarefa.prioridade}
                      </span>
                    </span>
                    <div className="flex items-center justify-center gap-2 px-3 py-3 max-[1100px]:justify-start max-[1100px]:px-0 max-[1100px]:py-0">
                      <button
                        className="min-h-8 rounded-md border border-white/10 px-2.5 text-[10px] font-bold text-slate-200 transition hover:border-sky-300/40 hover:text-sky-100"
                        onClick={() => abrirEdicao(tarefa)}
                        type="button"
                      >
                        Editar
                      </button>
                      <button
                        className="min-h-8 rounded-md border border-white/10 px-2.5 text-[10px] font-bold text-rose-200 transition hover:border-rose-300/40 hover:bg-rose-300/10"
                        onClick={() => setTarefaParaExcluir(tarefa)}
                        type="button"
                      >
                        Excluir
                      </button>
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {formAberto && (
        <div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-slate-950/78 px-4 py-6 backdrop-blur-sm">
          {/* Altura presa a da janela e rolagem so no meio: em tela baixa o
              formulario inteiro nao cabe, e o botao de salvar nao pode ficar
              fora do alcance. */}
          <form
            className="flex max-h-[calc(100dvh-3rem)] w-full max-w-lg flex-col rounded-2xl border border-white/10 bg-[#061020] shadow-2xl shadow-black/40"
            onSubmit={salvar}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-300">Minhas tarefas</p>
                <h2 className="mt-1 text-lg font-black text-slate-100">
                  {tarefaEmEdicao ? "Editar tarefa" : "Nova tarefa"}
                </h2>
              </div>
              <button
                className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 transition hover:border-sky-300/30 hover:text-sky-100"
                onClick={() => setFormAberto(false)}
                type="button"
              >
                Fechar
              </button>
            </div>

            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-5">
              {/* O aviso da pagina fica atras do modal; com ele aberto, o erro
                  da validacao precisa aparecer aqui dentro. */}
              {feedback?.tipo === "erro" && (
                <p className="rounded-lg border border-rose-300/25 bg-rose-300/10 px-3 py-2 text-xs text-rose-100">
                  {feedback.texto}
                </p>
              )}

              <Campo label="Tarefa">
                <input
                  className={campoClass()}
                  onChange={(evento) => setFormulario((atual) => ({ ...atual, titulo: evento.target.value }))}
                  placeholder="Ex.: Conferir parcelamento do cliente XYZ"
                  value={formulario.titulo}
                />
              </Campo>

              <Campo label="Observação (opcional)">
                <textarea
                  className="min-h-20 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 outline-none placeholder:text-slate-600"
                  onChange={(evento) => setFormulario((atual) => ({ ...atual, descricao: evento.target.value }))}
                  placeholder="Detalhe o que precisa ser feito"
                  value={formulario.descricao}
                />
              </Campo>

              <div className="grid grid-cols-2 gap-3 max-[560px]:grid-cols-1">
                <Campo label="Acontece">
                  <select
                    className={campoClass()}
                    onChange={(evento) =>
                      setFormulario((atual) => ({ ...atual, tipo: evento.target.value as TipoTarefaPessoal }))
                    }
                    value={formulario.tipo}
                  >
                    <option value="Recorrente">Toda vez (recorrente)</option>
                    <option value="Única">Uma vez só</option>
                  </select>
                </Campo>

                <Campo label="Repete a cada">
                  <select
                    className={`${campoClass()} ${formulario.tipo !== "Recorrente" ? "cursor-not-allowed opacity-60" : ""}`}
                    disabled={formulario.tipo !== "Recorrente"}
                    onChange={(evento) =>
                      setFormulario((atual) => ({ ...atual, recorrencia: evento.target.value as RecorrenciaTarefaPessoal }))
                    }
                    value={formulario.recorrencia}
                  >
                    {recorrenciasTarefaPessoal.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </Campo>
              </div>

              <div className="grid grid-cols-2 gap-3 max-[560px]:grid-cols-1">
                <Campo label={formulario.tipo === "Recorrente" ? "Primeira data" : "Data"}>
                  <input
                    className={campoClass()}
                    onChange={(evento) => setFormulario((atual) => ({ ...atual, prazo: evento.target.value }))}
                    type="date"
                    value={formulario.prazo}
                  />
                </Campo>

                <Campo label="Prioridade">
                  <select
                    className={campoClass()}
                    onChange={(evento) =>
                      setFormulario((atual) => ({ ...atual, prioridade: evento.target.value as PrioridadeTarefaPessoal }))
                    }
                    value={formulario.prioridade}
                  >
                    {prioridadesTarefaPessoal.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </Campo>
              </div>

              {formulario.tipo === "Recorrente" && (
                <p className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] leading-5 text-slate-400">
                  O dia da primeira data define a repetição. Ex.: escolhendo 02/08/2026 em uma tarefa mensal, ela aparece
                  todo dia 02 na sua agenda.
                </p>
              )}

              <Campo label="Para quem é a tarefa">
                <select
                  className={campoClass()}
                  onChange={(evento) => setFormulario((atual) => ({ ...atual, alvo: evento.target.value as Alvo }))}
                  value={formulario.alvo}
                >
                  <option value="nenhum">Só a tarefa, sem cliente</option>
                  <option value="clientes">Clientes escolhidos</option>
                  <option value="regimes">Todos os clientes de um regime</option>
                </select>
              </Campo>

              {formulario.alvo === "clientes" && (
                <fieldset className="grid gap-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <legend className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                      Clientes ({formulario.clientes.length} marcado(s))
                    </legend>
                    <button
                      className="rounded-md border border-white/10 px-2.5 py-1 text-[10px] font-bold text-slate-300 transition hover:border-sky-300/40 hover:text-sky-100"
                      onClick={alternarTodosOsClientes}
                      type="button"
                    >
                      {formulario.clientes.length === clientesAtivos.length ? "Desmarcar todos" : "Marcar todos"}
                    </button>
                  </div>
                  <div className="grid max-h-52 gap-2 overflow-y-auto rounded-lg border border-white/10 bg-slate-950/60 p-2">
                    {clientesAtivos.length === 0 && <p className="px-1 py-2 text-xs text-slate-500">Nenhum cliente ativo cadastrado.</p>}
                    {clientesAtivos.map((cliente) => (
                      <label
                        className="flex min-h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 text-xs text-slate-300"
                        key={cliente.id}
                      >
                        <input
                          checked={formulario.clientes.includes(cliente.id)}
                          className="accent-sky-300"
                          onChange={(evento) => alternarCliente(cliente.id, evento.target.checked)}
                          type="checkbox"
                        />
                        <span className="truncate">{nomeDoCliente(cliente)}</span>
                        <span className="ml-auto shrink-0 text-[10px] text-slate-600">{cliente.regime_tributario || "Sem regime"}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              {formulario.alvo === "regimes" && (
                <fieldset className="grid gap-1.5">
                  <legend className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Regimes tributários</legend>
                  <div className="grid max-h-52 gap-2 overflow-y-auto rounded-lg border border-white/10 bg-slate-950/60 p-2">
                    {regimes.length === 0 && <p className="px-1 py-2 text-xs text-slate-500">Nenhum cliente ativo tem regime preenchido.</p>}
                    {regimes.map(([regime, quantidade]) => (
                      <label
                        className="flex min-h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 text-xs text-slate-300"
                        key={regime}
                      >
                        <input
                          checked={formulario.regimes.includes(regime)}
                          className="accent-sky-300"
                          onChange={(evento) => alternarRegime(regime, evento.target.checked)}
                          type="checkbox"
                        />
                        <span className="truncate">{regime}</span>
                        <span className="ml-auto shrink-0 text-[10px] text-slate-600">{quantidade} cliente(s)</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-[11px] leading-5 text-slate-500">
                    Cliente novo desse regime entra na tarefa sozinho, sem precisar reeditar.
                  </p>
                </fieldset>
              )}
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-white/10 p-5 max-[560px]:grid">
              <button
                className="min-h-10 rounded-lg border border-white/10 px-4 text-xs font-bold text-slate-300 transition hover:border-sky-300/30 hover:text-sky-100"
                onClick={() => setFormAberto(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="min-h-10 rounded-lg bg-sky-300 px-5 text-xs font-black text-slate-950 shadow-[0_18px_42px_rgba(56,189,248,0.20)] transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={salvando}
                type="submit"
              >
                {salvando ? "Salvando..." : tarefaEmEdicao ? "Atualizar tarefa" : "Salvar tarefa"}
              </button>
            </div>
          </form>
        </div>
      )}

      {confirmacao && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/78 px-4 py-6 backdrop-blur-sm">
          <section className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#061020] p-6 shadow-2xl shadow-black/40">
            <h2 className="text-lg font-black text-slate-100">Confirmar {confirmacao.cliente ? "finalização" : "conclusão"}</h2>
            <p className="mt-3 text-sm text-slate-300">
              {confirmacao.cliente ? (
                <>
                  Finalizar <strong>{confirmacao.ocorrencia.tarefa.titulo}</strong> para{" "}
                  <strong>{nomeDoCliente(confirmacao.cliente)}</strong> em {confirmacao.ocorrencia.dataLabel}?
                </>
              ) : (
                <>
                  Concluir <strong>{confirmacao.ocorrencia.tarefa.titulo}</strong> em {confirmacao.ocorrencia.dataLabel}?
                </>
              )}
            </p>
            {confirmacao.ocorrencia.tarefa.tipo === "Recorrente" && (
              <p className="mt-2 text-xs text-slate-500">A tarefa continua valendo para as próximas datas da recorrência.</p>
            )}
            {confirmacao.cliente && confirmacao.ocorrencia.clientesPendentes.length > 1 && (
              <p className="mt-2 text-xs text-slate-500">
                Faltam outros {confirmacao.ocorrencia.clientesPendentes.length - 1} cliente(s) neste dia.
              </p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                className="min-h-10 rounded-lg border border-white/10 px-4 text-xs font-bold text-slate-200 transition hover:border-sky-300/40 hover:text-sky-100"
                onClick={() => setConfirmacao(null)}
                type="button"
              >
                Não
              </button>
              <button
                className="min-h-10 rounded-lg bg-emerald-300 px-4 text-xs font-black text-slate-950 transition hover:bg-emerald-200"
                onClick={() => {
                  concluir(confirmacao.ocorrencia, confirmacao.cliente);
                  setConfirmacao(null);
                }}
                type="button"
              >
                Sim
              </button>
            </div>
          </section>
        </div>
      )}

      <ConfirmDeleteModal
        isDeleting={excluindo}
        isOpen={Boolean(tarefaParaExcluir)}
        onCancel={() => setTarefaParaExcluir(null)}
        onConfirm={excluir}
      />
    </ErpChrome>
  );
}
