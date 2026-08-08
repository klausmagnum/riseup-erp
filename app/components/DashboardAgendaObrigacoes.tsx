"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { currentUserStorageKey } from "@/app/components/TopbarUser";
import { supabase } from "@/app/lib/supabaseClient";
import { requisitarApi } from "@/app/lib/apiClient";
import { loadTasks, saveTasks, Tarefa } from "@/app/cadastros/tarefas/tarefaStorage";
import {
  gerarAgendaPessoal,
  nomeDoCliente,
  type ClienteDaTarefa,
  type OcorrenciaTarefaPessoal,
  type TarefaPessoal,
  type TarefasPessoaisApiResponse,
} from "@/app/lib/tarefasPessoais";

type Obrigacao = {
  id: string;
  nome: string;
  validacao: boolean | null;
  regime: string | null;
  periodicidade: string | null;
  prazo: string | null;
  mes: string | null;
  dias: string | null;
  meses_subsequentes: string | null;
  data_inicio: string | null;
  tipo_prazo: string | null;
  prazo_util: string | null;
  ajuste_prazo: string | null;
  regras_vencimento: Array<{ dia?: string; mes?: string; competencia?: string; mesesSubsequentes?: string; tipo?: string }> | null;
  setor: string | null;
  status: string | null;
};

type RegraVencimento = NonNullable<Obrigacao["regras_vencimento"]>[number];

type Cliente = {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  identificacao: string | null;
  regime_tributario: string | null;
  obrigacoes_vinculadas: string[] | null;
  status: string | null;
};

type AgendaObrigacao = Obrigacao & {
  dataVencimento: Date | null;
  dataChave: string;
  dataLabel: string;
  diasAteVencer: number | null;
};

type LoggedUser = {
  id: string;
  nome: string;
  email: string | null;
  perfil: string;
  setores?: string[] | null;
};

type FinalizacaoRecord = {
  id: string;
  finalizacaoKey: string;
  obrigacaoId: string;
  obrigacaoNome: string;
  clienteId: string;
  clienteNome: string;
  dataVencimento: string;
  dataVencimentoLabel: string;
  finalizadoEm: string;
  finalizadoPorId: string;
  finalizadoPorNome: string;
};

type AgendaApiResponse = {
  obrigacoes?: Obrigacao[];
  clientes?: Cliente[];
  error?: string;
};

type UsuarioSistema = {
  id: string;
  nome: string;
  email: string | null;
  setor: string | null;
  setores: string[] | null;
  perfil: string;
  status: string;
};

type UsuariosApiResponse = {
  usuarios?: UsuarioSistema[];
  error?: string;
};

type AgendaTarefa = Tarefa & {
  dataVencimento: Date;
  dataChave: string;
  dataLabel: string;
  diasAteVencer: number;
  agendaKey: string;
};

type AgendaItem =
  | { tipoAgenda: "obrigacao"; sortDate: Date | null; item: AgendaObrigacao }
  | { tipoAgenda: "tarefa"; sortDate: Date; item: AgendaTarefa }
  // Tarefa pessoal do My Desktop: entra na mesma fila por data, mas so aparece
  // para quem a cadastrou — a rota /api/tarefas-pessoais nunca devolve as dos
  // outros usuarios.
  | { tipoAgenda: "pessoal"; sortDate: Date; item: OcorrenciaTarefaPessoal };

const periodicidadeOrder = ["Mensal", "Quinzenal", "Decendial", "Trimestral", "Semestral", "Anual"];
const finalizedStorageKey = "tf-dashboard-obrigacoes-finalizadas";
const finalizationHistoryStorageKey = "tf-dashboard-obrigacoes-finalizacoes";
const finalizedTasksStorageKey = "tf-dashboard-tarefas-finalizadas";

const monthNames: Record<string, number> = {
  jan: 0,
  janeiro: 0,
  fev: 1,
  fevereiro: 1,
  mar: 2,
  marco: 2,
  abr: 3,
  abril: 3,
  mai: 4,
  maio: 4,
  jun: 5,
  junho: 5,
  jul: 6,
  julho: 6,
  ago: 7,
  agosto: 7,
  set: 8,
  setembro: 8,
  out: 9,
  outubro: 9,
  nov: 10,
  novembro: 10,
  dez: 11,
  dezembro: 11,
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim();
}

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function buildDate(year: number, month: number, day: number) {
  const safeDay = Math.min(Math.max(day, 1), lastDayOfMonth(year, month));
  return new Date(year, month, safeDay);
}

function isBusinessDay(date: Date) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function getNthBusinessDay(year: number, month: number, targetDay: number) {
  let businessDays = 0;
  const totalDays = lastDayOfMonth(year, month);

  for (let day = 1; day <= totalDays; day += 1) {
    const date = new Date(year, month, day);
    if (!isBusinessDay(date)) continue;

    businessDays += 1;
    if (businessDays === targetDay) return date;
  }

  return new Date(year, month, totalDays);
}

function adjustNonBusinessDate(date: Date, rule: string | null | undefined) {
  if (isBusinessDay(date)) return date;

  const normalizedRule = normalizeKey(normalizeText(rule));
  const adjustedDate = new Date(date);

  if (normalizedRule.includes("antecipar")) {
    while (!isBusinessDay(adjustedDate)) {
      adjustedDate.setDate(adjustedDate.getDate() - 1);
    }
    return adjustedDate;
  }

  if (normalizedRule.includes("postergar")) {
    while (!isBusinessDay(adjustedDate)) {
      adjustedDate.setDate(adjustedDate.getDate() + 1);
    }
    return adjustedDate;
  }

  return date;
}

function daysBetween(from: Date, to: Date) {
  return Math.ceil((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseControlStartDate(value: string | null | undefined) {
  const cleanValue = normalizeText(value);
  if (!cleanValue) return null;

  const isoDate = cleanValue.match(/^(\d{4})[/-](\d{2})[/-](\d{2})/);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const displayDate = cleanValue.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  if (displayDate) {
    const [, day, month, year] = displayDate;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  return null;
}

function parsePrazo(prazo: string) {
  const cleanPrazo = normalizeKey(prazo);
  const dayMonth = cleanPrazo.match(/(\d{1,2})\s*[/-]\s*(\d{1,2})/);

  if (dayMonth) {
    return { day: Number(dayMonth[1]), month: Number(dayMonth[2]) - 1, isLastDay: false };
  }

  const monthEntry = Object.entries(monthNames).find(([name]) => cleanPrazo.includes(name));
  const dayOnly = cleanPrazo.match(/\d{1,2}/);

  return {
    day: dayOnly ? Number(dayOnly[0]) : 30,
    month: monthEntry?.[1],
    isLastDay: cleanPrazo.includes("ultimo"),
  };
}

function parseMonthValue(value: string | null | undefined) {
  const normalizedValue = normalizeKey(normalizeText(value));
  if (!normalizedValue) return undefined;

  const numericMonth = normalizedValue.match(/^\d{1,2}$/);
  if (numericMonth) {
    const month = Number(numericMonth[0]);
    return month >= 1 && month <= 12 ? month - 1 : undefined;
  }

  return Object.entries(monthNames).find(([name]) => normalizedValue.includes(name))?.[1];
}

function getRulePrazo(obrigacao: Obrigacao, regra?: RegraVencimento) {
  return normalizeText(regra?.dia) || normalizeText(obrigacao.prazo) || normalizeText(obrigacao.dias);
}

function getRuleDayAndMonth(obrigacao: Obrigacao, regra?: RegraVencimento) {
  const prazo = getRulePrazo(obrigacao, regra);
  if (!prazo || normalizeKey(prazo).includes("nao informado")) return null;

  const parsed = parsePrazo(prazo);
  const savedMonth = parseMonthValue(obrigacao.mes);
  const ruleMonth = parseMonthValue(regra?.mes);
  const configuredMonth = parsed.month ?? ruleMonth ?? savedMonth;

  return {
    day: parsed.day,
    month: configuredMonth,
    isLastDay: parsed.isLastDay,
    mesesSubsequentes: getMonthsSubsequentes(regra?.mesesSubsequentes ?? obrigacao.meses_subsequentes),
    tipoPrazo: normalizeText(regra?.tipo) || normalizeText(obrigacao.tipo_prazo),
    ajustePrazo: normalizeText(obrigacao.ajuste_prazo) || normalizeText(obrigacao.prazo_util),
  };
}

function getRules(obrigacao: Obrigacao) {
  const regras = Array.isArray(obrigacao.regras_vencimento) ? obrigacao.regras_vencimento : [];
  return regras.length > 0 ? regras : [undefined];
}

function hasSchedulableRule(obrigacao: Obrigacao) {
  return getRules(obrigacao).some((regra) => getRuleDayAndMonth(obrigacao, regra) !== null);
}

function getPeriodIndex(value: string | null | undefined) {
  const normalized = normalizeKey(normalizeText(value));
  const number = normalized.match(/\d/);
  if (!number) return 0;
  return Math.max(Number(number[0]) - 1, 0);
}

function getMonthsSubsequentes(value: string | null | undefined) {
  const number = normalizeText(value).match(/\d+/);
  return number ? Number(number[0]) : 0;
}

function isWithinAgendaWindow(date: Date, start: Date, end: Date) {
  const time = startOfDay(date).getTime();
  return time >= startOfDay(start).getTime() && time <= startOfDay(end).getTime();
}

function pushOccurrence(
  occurrences: Date[],
  date: Date,
  start: Date,
  end: Date,
  seenDates: Set<string>
) {
  if (!isWithinAgendaWindow(date, start, end)) return;

  const key = formatDateKey(date);
  if (seenDates.has(key)) return;

  seenDates.add(key);
  occurrences.push(date);
}

function buildRuleDate(year: number, month: number, day: number, isLastDay: boolean) {
  return buildDate(year, month, isLastDay ? lastDayOfMonth(year, month) : day);
}

function buildDueDate(year: number, month: number, rule: NonNullable<ReturnType<typeof getRuleDayAndMonth>>) {
  if (normalizeKey(rule.tipoPrazo).includes("uteis")) {
    return getNthBusinessDay(year, month, rule.day);
  }

  return adjustNonBusinessDate(buildRuleDate(year, month, rule.day, rule.isLastDay), rule.ajustePrazo);
}

function getDueOccurrences(obrigacao: Obrigacao, today: Date) {
  const controlStart = parseControlStartDate(obrigacao.data_inicio);
  const startMonth = controlStart ?? new Date(today.getFullYear(), today.getMonth(), 1);
  const end = endOfMonth(addMonths(new Date(today.getFullYear(), today.getMonth(), 1), 2));
  const periodicidade = normalizeKey(normalizeText(obrigacao.periodicidade));
  const occurrences: Date[] = [];
  const seenDates = new Set<string>();
  const rules = getRules(obrigacao);

  for (const regra of rules) {
    const parsed = getRuleDayAndMonth(obrigacao, regra);
    if (!parsed) continue;

    const { month: configuredMonth, mesesSubsequentes } = parsed;

    if (periodicidade.includes("anual")) {
      const targetMonth = configuredMonth ?? today.getMonth();
      for (let year = startMonth.getFullYear(); year <= end.getFullYear(); year += 1) {
        pushOccurrence(occurrences, buildDueDate(year, targetMonth, parsed), startMonth, end, seenDates);
      }
      continue;
    }

    if (periodicidade.includes("semestral")) {
      const semesterIndex = Math.min(getPeriodIndex(regra?.competencia), 1);
      const baseMonth = [5, 11][semesterIndex];
      const targetMonth = configuredMonth ?? baseMonth + mesesSubsequentes;

      for (let year = startMonth.getFullYear(); year <= end.getFullYear(); year += 1) {
        pushOccurrence(occurrences, buildDueDate(year, targetMonth, parsed), startMonth, end, seenDates);
      }
      continue;
    }

    if (periodicidade.includes("trimestral")) {
      const trimesterIndex = Math.min(getPeriodIndex(regra?.competencia), 3);
      const baseMonth = [2, 5, 8, 11][trimesterIndex];
      const targetMonth = configuredMonth ?? baseMonth + mesesSubsequentes;

      for (let year = startMonth.getFullYear(); year <= end.getFullYear(); year += 1) {
        pushOccurrence(occurrences, buildDueDate(year, targetMonth, parsed), startMonth, end, seenDates);
      }
      continue;
    }

    let cursor = startMonth;
    while (cursor.getTime() <= end.getTime()) {
      const year = cursor.getFullYear();
      const month = cursor.getMonth();
      const dueMonth = month + mesesSubsequentes;

      if (periodicidade.includes("quinzenal")) {
        [Math.min(parsed.day, 15), Math.max(parsed.day, 15)].forEach((dueDay) => {
          pushOccurrence(occurrences, buildDueDate(year, dueMonth, { ...parsed, day: dueDay }), startMonth, end, seenDates);
        });
      } else if (periodicidade.includes("decendial")) {
        [10, 20, 30, parsed.day].forEach((dueDay) => {
          pushOccurrence(occurrences, buildDueDate(year, dueMonth, { ...parsed, day: dueDay }), startMonth, end, seenDates);
        });
      } else {
        pushOccurrence(occurrences, buildDueDate(year, dueMonth, parsed), startMonth, end, seenDates);
      }

      cursor = addMonths(cursor, 1);
    }
  }

  return occurrences.sort((a, b) => a.getTime() - b.getTime());
}

function getTone(periodicidade: string) {
  if (periodicidade === "Mensal") return "border-sky-300/25 bg-sky-300/10 text-sky-200";
  if (periodicidade === "Anual") return "border-violet-300/25 bg-violet-300/10 text-violet-200";
  if (periodicidade === "Trimestral" || periodicidade === "Semestral") return "border-blue-300/25 bg-blue-300/10 text-blue-200";
  return "border-amber-300/25 bg-amber-300/10 text-amber-200";
}

function getDueTone(days: number | null) {
  if (days === null) return "border-white/10 bg-slate-950/70 text-slate-400";
  if (days < 0) return "border-rose-300/25 bg-rose-300/10 text-rose-200";
  if (days <= 3) return "border-amber-300/25 bg-amber-300/10 text-amber-200";
  if (days <= 7) return "border-amber-300/25 bg-amber-300/10 text-amber-200";
  return "border-emerald-300/25 bg-emerald-300/10 text-emerald-200";
}

function isDueWithinFiveDays(days: number | null) {
  return days !== null && days >= 0 && days <= 5;
}

function isOverdue(days: number | null) {
  return days !== null && days < 0;
}

function formatDueDistance(days: number | null) {
  if (days === null) return "Revisar cadastro";
  if (days < 0) return `Vencida há ${Math.abs(days)} dia(s)`;
  if (days === 0) return "Vence hoje";
  return `Vence em ${days} dia(s)`;
}

function getFinalizacaoKey(obrigacao: Pick<AgendaObrigacao, "id" | "dataChave">) {
  return `${obrigacao.id}:${obrigacao.dataChave}`;
}

function getLoggedUser() {
  if (typeof window === "undefined") return null;

  try {
    const stored = window.localStorage.getItem(currentUserStorageKey);
    return stored ? JSON.parse(stored) as LoggedUser : null;
  } catch {
    return null;
  }
}

function getFinalizationHistory() {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(finalizationHistoryStorageKey);
    return stored ? JSON.parse(stored) as FinalizacaoRecord[] : [];
  } catch {
    return [];
  }
}

function saveFinalizationRecord(record: FinalizacaoRecord) {
  const records = getFinalizationHistory();
  const alreadyExists = records.some((item) => item.finalizacaoKey === record.finalizacaoKey && item.clienteId === record.clienteId);
  const nextRecords = alreadyExists ? records : [record, ...records];
  window.localStorage.setItem(finalizationHistoryStorageKey, JSON.stringify(nextRecords));
}


function getTaskFinalizacaoKey(tarefa: Pick<AgendaTarefa, "id" | "dataChave">) {
  return `${tarefa.id}:${tarefa.dataChave}`;
}

function parseIsoDate(value: string | null | undefined) {
  const cleanValue = normalizeText(value);
  if (!cleanValue) return null;

  const match = cleanValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function addTaskOccurrence(occurrences: Date[], date: Date, start: Date, end: Date, seenDates: Set<string>) {
  if (startOfDay(date).getTime() < startOfDay(start).getTime()) return;
  if (startOfDay(date).getTime() > startOfDay(end).getTime()) return;

  const key = formatDateKey(date);
  if (seenDates.has(key)) return;

  seenDates.add(key);
  occurrences.push(date);
}

function getTaskDueOccurrences(tarefa: Tarefa, today: Date) {
  const dueDate = parseIsoDate(tarefa.prazo);
  if (!dueDate) return [];

  const controlStart = parseIsoDate(tarefa.dataInicio) ?? dueDate;
  const end = endOfMonth(addMonths(new Date(today.getFullYear(), today.getMonth(), 1), 2));
  const occurrences: Date[] = [];
  const seenDates = new Set<string>();

  if (tarefa.tipo !== "Recorrente") {
    addTaskOccurrence(occurrences, dueDate, controlStart, end, seenDates);
    return occurrences;
  }

  const day = dueDate.getDate();
  const month = dueDate.getMonth();
  const recurrence = normalizeKey(tarefa.recorrencia);

  if (recurrence.includes("anual")) {
    for (let year = controlStart.getFullYear(); year <= end.getFullYear(); year += 1) {
      addTaskOccurrence(occurrences, buildDate(year, month, day), controlStart, end, seenDates);
    }
    return occurrences.sort((a, b) => a.getTime() - b.getTime());
  }

  if (recurrence.includes("diario")) {
    let cursor = startOfDay(controlStart);
    while (cursor.getTime() <= end.getTime()) {
      addTaskOccurrence(occurrences, cursor, controlStart, end, seenDates);
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    }
    return occurrences.sort((a, b) => a.getTime() - b.getTime());
  }

  if (recurrence.includes("semanal")) {
    let cursor = startOfDay(controlStart);
    while (cursor.getTime() <= end.getTime()) {
      addTaskOccurrence(occurrences, cursor, controlStart, end, seenDates);
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7);
    }
    return occurrences.sort((a, b) => a.getTime() - b.getTime());
  }

  let cursor = new Date(controlStart.getFullYear(), controlStart.getMonth(), 1);
  while (cursor.getTime() <= end.getTime()) {
    const year = cursor.getFullYear();
    const currentMonth = cursor.getMonth();

    if (recurrence.includes("quinzenal")) {
      addTaskOccurrence(occurrences, buildDate(year, currentMonth, Math.min(day, 15)), controlStart, end, seenDates);
      addTaskOccurrence(occurrences, buildDate(year, currentMonth, Math.max(day, 15)), controlStart, end, seenDates);
    } else if (recurrence.includes("trimestral")) {
      addTaskOccurrence(occurrences, buildDate(year, currentMonth, day), controlStart, end, seenDates);
      cursor = addMonths(cursor, 3);
      continue;
    } else {
      addTaskOccurrence(occurrences, buildDate(year, currentMonth, day), controlStart, end, seenDates);
    }

    cursor = addMonths(cursor, 1);
  }

  return occurrences.sort((a, b) => a.getTime() - b.getTime());
}

async function loadAgendaData() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return {
      response: null,
      result: { error: "Sessão não encontrada. Entre novamente no sistema." } as AgendaApiResponse,
    };
  }

  const response = await fetch("/api/dashboard/agenda-obrigacoes", {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });
  const result = await response.json().catch(() => ({} as AgendaApiResponse));

  return { response, result };
}

async function loadUsuariosSistema() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { usuarios: [], error: "Sessão não encontrada. Entre novamente no sistema." } as UsuariosApiResponse;
  }

  const response = await fetch("/api/usuarios-sistema", {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  return response.json().catch(() => ({ usuarios: [] })) as Promise<UsuariosApiResponse>;
}

export default function DashboardAgendaObrigacoes() {
  const [obrigacoes, setObrigacoes] = useState<Obrigacao[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [tarefas, setTarefas] = useState<Tarefa[]>(() => loadTasks());
  const [tarefasPessoais, setTarefasPessoais] = useState<TarefaPessoal[]>([]);
  const [allowedTaskSetores, setAllowedTaskSetores] = useState<string[] | null>(null);
  const [search, setSearch] = useState("");
  const [periodicidade, setPeriodicidade] = useState("Todas");
  const [expandedObrigacaoId, setExpandedObrigacaoId] = useState<string | null>(null);
  const [expandedTarefaId, setExpandedTarefaId] = useState<string | null>(null);
  const [finalizedTasks, setFinalizedTasks] = useState<Record<string, boolean | string[]>>(() => {
    if (typeof window === "undefined") return {};

    try {
      const stored = window.localStorage.getItem(finalizedTasksStorageKey);
      return stored ? JSON.parse(stored) as Record<string, boolean | string[]> : {};
    } catch {
      return {};
    }
  });
  const [finalizedClientes, setFinalizedClientes] = useState<Record<string, string[]>>(() => {
    if (typeof window === "undefined") return {};

    try {
      const stored = window.localStorage.getItem(finalizedStorageKey);
      return stored ? JSON.parse(stored) as Record<string, string[]> : {};
    } catch {
      return {};
    }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [confirmModal, setConfirmModal] = useState<{ tarefa: AgendaTarefa; cliente: string } | null>(null);
  const [confirmObrigacaoModal, setConfirmObrigacaoModal] = useState<{ obrigacao: AgendaObrigacao; cliente: Cliente } | null>(null);
  const [confirmPessoalModal, setConfirmPessoalModal] = useState<{ ocorrencia: OcorrenciaTarefaPessoal; cliente: ClienteDaTarefa | null } | null>(null);
  const [expandedPessoalId, setExpandedPessoalId] = useState<string | null>(null);
  const today = useMemo(() => startOfDay(new Date()), []);

  useEffect(() => {
    window.localStorage.setItem(finalizedStorageKey, JSON.stringify(finalizedClientes));
  }, [finalizedClientes]);

  useEffect(() => {
    window.localStorage.setItem(finalizedTasksStorageKey, JSON.stringify(finalizedTasks));
  }, [finalizedTasks]);

  useEffect(() => {
    async function loadObrigacoes() {
      setIsLoading(true);
      setFeedback("");

      const [{ response, result }, usuariosResult, pessoaisResult] = await Promise.all([
        loadAgendaData(),
        loadUsuariosSistema(),
        requisitarApi<TarefasPessoaisApiResponse>("/api/tarefas-pessoais"),
      ]);

      if (!response?.ok) {
        setFeedback(result.error || "Não foi possível carregar a agenda de obrigações.");
        setIsLoading(false);
        return;
      }

      setObrigacoes(result.obrigacoes ?? []);
      setClientes(result.clientes ?? []);
      setTarefasPessoais(pessoaisResult.ok ? pessoaisResult.result.tarefas ?? [] : []);

      const loggedUser = getLoggedUser();
      const usuarioSistema = usuariosResult.usuarios?.find((usuario) =>
        (loggedUser?.id && usuario.id === loggedUser.id) ||
        (loggedUser?.email && usuario.email?.toLowerCase() === loggedUser.email.toLowerCase())
      );
      const setoresUsuario = [
        ...(usuarioSistema?.setores ?? []),
        ...(usuarioSistema?.setor ? [usuarioSistema.setor] : []),
        ...(loggedUser?.setores ?? []),
      ].filter(Boolean);
      const hasTodos = setoresUsuario.some((setor) => normalizeKey(setor).includes("todos"));
      const perfil = normalizeKey(usuarioSistema?.perfil ?? loggedUser?.perfil ?? "");

      setAllowedTaskSetores(hasTodos || (setoresUsuario.length === 0 && ["administrador", "gestor"].includes(perfil)) ? null : setoresUsuario);
      setIsLoading(false);
    }

    loadObrigacoes();
  }, []);

  const activeObrigacoes = useMemo(
    () => obrigacoes.filter((obrigacao) => normalizeText(obrigacao.status).toLowerCase() !== "inativo"),
    [obrigacoes]
  );

  const agendaObrigacoes = useMemo<AgendaObrigacao[]>(() => {
    return activeObrigacoes
      .flatMap((obrigacao): AgendaObrigacao[] => {
        const ocorrencias = getDueOccurrences(obrigacao, today);

        if (ocorrencias.length === 0) {
          if (hasSchedulableRule(obrigacao)) return [];

          return [{
            ...obrigacao,
            dataVencimento: null,
            diasAteVencer: null,
            dataChave: "sem-data",
            dataLabel: "Sem data definida",
          }];
        }

        return ocorrencias.map((dataVencimento) => ({
          ...obrigacao,
          dataVencimento,
          diasAteVencer: daysBetween(today, dataVencimento),
          dataChave: formatDateKey(dataVencimento),
          dataLabel: formatDate(dataVencimento),
        }));
      })
      .sort((a, b) => {
        if (!a.dataVencimento && !b.dataVencimento) return normalizeText(a.nome).localeCompare(normalizeText(b.nome));
        if (!a.dataVencimento) return 1;
        if (!b.dataVencimento) return -1;
        return a.dataVencimento.getTime() - b.dataVencimento.getTime() || normalizeText(a.nome).localeCompare(normalizeText(b.nome));
      });
  }, [activeObrigacoes, today]);


  const agendaTarefas = useMemo<AgendaTarefa[]>(() => {
    return tarefas
      .filter((tarefa) => tarefa.status !== "Concluida")
      .filter((tarefa) => {
        if (allowedTaskSetores === null) return true;
        const setorTarefa = normalizeKey(tarefa.setor);
        return allowedTaskSetores.some((setor) => normalizeKey(setor) === setorTarefa);
      })
      .flatMap((tarefa): AgendaTarefa[] => {
        return getTaskDueOccurrences(tarefa, today).map((dataVencimento) => {
          const dataChave = formatDateKey(dataVencimento);
          return {
            ...tarefa,
            dataVencimento,
            dataChave,
            dataLabel: formatDate(dataVencimento),
            diasAteVencer: daysBetween(today, dataVencimento),
            agendaKey: `${tarefa.id}:${dataChave}`,
          };
        });
      })
      .filter((tarefa) => {
        const clientesDaTarefa = tarefa.clientes.length > 0 ? tarefa.clientes : tarefa.cliente ? [tarefa.cliente] : [];
        const finalized = finalizedTasks[getTaskFinalizacaoKey(tarefa)];

        if (finalized === true) return false;
        if (!Array.isArray(finalized)) return clientesDaTarefa.length > 0;

        return clientesDaTarefa.some((cliente) => !finalized.includes(cliente));
      })
      .filter((tarefa) => {
        const searchText = search.toLowerCase();
        return `${tarefa.titulo} ${tarefa.cliente} ${tarefa.clientes.join(" ")} ${tarefa.setor} ${tarefa.responsavel} ${tarefa.dataLabel}`.toLowerCase().includes(searchText);
      })
      .sort((a, b) => a.dataVencimento.getTime() - b.dataVencimento.getTime() || a.titulo.localeCompare(b.titulo, "pt-BR"));
  }, [allowedTaskSetores, finalizedTasks, search, tarefas, today]);

  function getClientesDaTarefa(tarefa: AgendaTarefa) {
    const clientesDaTarefa = tarefa.clientes.length > 0 ? tarefa.clientes : tarefa.cliente ? [tarefa.cliente] : [];
    const finalized = finalizedTasks[getTaskFinalizacaoKey(tarefa)];

    if (finalized === true) return [];
    if (!Array.isArray(finalized)) return clientesDaTarefa;

    return clientesDaTarefa.filter((cliente) => !finalized.includes(cliente));
  }

  function finalizarClienteTarefa(tarefa: AgendaTarefa, cliente: string) {
    const finalizacaoKey = getTaskFinalizacaoKey(tarefa);
    const clientesDaTarefa = tarefa.clientes.length > 0 ? tarefa.clientes : tarefa.cliente ? [tarefa.cliente] : [];

    setFinalizedTasks((current) => ({
      ...current,
      [finalizacaoKey]: Array.from(new Set([
        ...(Array.isArray(current[finalizacaoKey]) ? current[finalizacaoKey] as string[] : []),
        cliente,
      ])),
    }));

    const finalized = finalizedTasks[finalizacaoKey];
    const finalizedClientes = Array.isArray(finalized) ? finalized : [];
    const todosFinalizados = clientesDaTarefa.every((item) => item === cliente || finalizedClientes.includes(item));

    if (tarefa.tipo !== "Recorrente" && todosFinalizados) {
      const nextTasks = loadTasks().map((item) => item.id === tarefa.id ? {
        ...item,
        status: "Concluida" as const,
        finalizadaEm: new Date().toISOString(),
        evidenciaFinalizacao: item.evidenciaFinalizacao || "Finalizada pelo dashboard.",
      } : item);
      saveTasks(nextTasks);
      setTarefas(nextTasks);
    }
  }

  const getClientesDaObrigacao = useCallback((obrigacao: AgendaObrigacao) => {
    const finalizedIds = finalizedClientes[getFinalizacaoKey(obrigacao)] ?? [];

    return clientes.filter((cliente) => {
      const isActive = normalizeText(cliente.status).toLowerCase() !== "inativo";
      return isActive && !finalizedIds.includes(cliente.id) && (cliente.obrigacoes_vinculadas ?? []).includes(obrigacao.id);
    });
  }, [clientes, finalizedClientes]);

  const filteredObrigacoes = useMemo(() => {
    const searchText = search.toLowerCase();

    return agendaObrigacoes.filter((obrigacao) => {
      const clientesDaObrigacao = getClientesDaObrigacao(obrigacao);
      const hasPendingClients = clientesDaObrigacao.length > 0;
      const clientesText = clientesDaObrigacao.map((cliente) => `${cliente.razao_social} ${cliente.nome_fantasia} ${cliente.identificacao}`).join(" ");
      const matchesSearch = `${obrigacao.nome} ${obrigacao.setor} ${obrigacao.periodicidade} ${obrigacao.regime} ${obrigacao.dataLabel} ${clientesText}`
        .toLowerCase()
        .includes(searchText);
      const matchesPeriod = periodicidade === "Todas" || normalizeText(obrigacao.periodicidade) === periodicidade;

      return hasPendingClients && matchesSearch && matchesPeriod;
    });
  }, [agendaObrigacoes, getClientesDaObrigacao, periodicidade, search]);

  const agendaPessoais = useMemo(() => {
    const searchText = search.toLowerCase();

    return gerarAgendaPessoal(tarefasPessoais, clientes, today).filter((ocorrencia) => {
      const nomesDosClientes = ocorrencia.clientesPendentes.map(nomeDoCliente).join(" ");
      return `${ocorrencia.tarefa.titulo} ${ocorrencia.tarefa.descricao ?? ""} ${ocorrencia.dataLabel} ${nomesDosClientes}`
        .toLowerCase()
        .includes(searchText);
    });
  }, [clientes, search, tarefasPessoais, today]);

  const agendaItems = useMemo<AgendaItem[]>(() => {
    return [
      ...filteredObrigacoes.map((obrigacao) => ({
        tipoAgenda: "obrigacao" as const,
        sortDate: obrigacao.dataVencimento,
        item: obrigacao,
      })),
      ...agendaTarefas.map((tarefa) => ({
        tipoAgenda: "tarefa" as const,
        sortDate: tarefa.dataVencimento,
        item: tarefa,
      })),
      ...agendaPessoais.map((ocorrencia) => ({
        tipoAgenda: "pessoal" as const,
        sortDate: ocorrencia.data,
        item: ocorrencia,
      })),
    ].sort((a, b) => {
      if (!a.sortDate && !b.sortDate) return 0;
      if (!a.sortDate) return 1;
      if (!b.sortDate) return -1;
      return a.sortDate.getTime() - b.sortDate.getTime();
    });
  }, [agendaPessoais, agendaTarefas, filteredObrigacoes]);

  const groupedByDate = useMemo(() => {
    return agendaItems.reduce<Record<string, AgendaItem[]>>((groups, agendaItem) => {
      const item = agendaItem.item;
      const key = `${item.dataChave}|${item.dataLabel}`;
      groups[key] = groups[key] ?? [];
      groups[key].push(agendaItem);
      return groups;
    }, {});
  }, [agendaItems]);

  function finalizarClienteObrigacao(obrigacao: AgendaObrigacao, cliente: Cliente) {
    const loggedUser = getLoggedUser();

    if (!loggedUser) {
      setFeedback("Faça login antes de finalizar uma obrigação.");
      return;
    }

    const finalizacaoKey = getFinalizacaoKey(obrigacao);
    saveFinalizationRecord({
      id: `${finalizacaoKey}:${cliente.id}`,
      finalizacaoKey,
      obrigacaoId: obrigacao.id,
      obrigacaoNome: obrigacao.nome,
      clienteId: cliente.id,
      clienteNome: cliente.razao_social,
      dataVencimento: obrigacao.dataChave,
      dataVencimentoLabel: obrigacao.dataLabel,
      finalizadoEm: new Date().toISOString(),
      finalizadoPorId: loggedUser.id,
      finalizadoPorNome: loggedUser.nome,
    });

    setFinalizedClientes((current) => ({
      ...current,
      [finalizacaoKey]: Array.from(new Set([...(current[finalizacaoKey] ?? []), cliente.id])),
    }));
  }

  async function concluirTarefaPessoal(ocorrencia: OcorrenciaTarefaPessoal, cliente: ClienteDaTarefa | null) {
    const clienteId = cliente?.id ?? null;

    // Some da agenda na hora; se o servidor recusar, volta com o aviso.
    setTarefasPessoais((current) =>
      current.map((tarefa) =>
        tarefa.id === ocorrencia.tarefa.id
          ? { ...tarefa, conclusoes: [...tarefa.conclusoes, { data: ocorrencia.dataChave, clienteId }] }
          : tarefa
      )
    );

    const { ok, result } = await requisitarApi<{ error?: string }>("/api/tarefas-pessoais/conclusoes", {
      method: "POST",
      body: JSON.stringify({ tarefaId: ocorrencia.tarefa.id, data: ocorrencia.dataChave, clienteId }),
    });

    if (!ok) {
      setFeedback(result.error || "Não foi possível concluir a tarefa.");
      setTarefasPessoais((current) =>
        current.map((tarefa) =>
          tarefa.id === ocorrencia.tarefa.id
            ? {
                ...tarefa,
                conclusoes: tarefa.conclusoes.filter(
                  (conclusao) => conclusao.data !== ocorrencia.dataChave || conclusao.clienteId !== clienteId
                ),
              }
            : tarefa
        )
      );
    }
  }

  const stats = useMemo(() => {
    const pendentesNoPrazo = agendaItems.filter((agendaItem) => isDueWithinFiveDays(agendaItem.item.diasAteVencer)).length;
    const pendentesVencidos = agendaItems.filter((agendaItem) => isOverdue(agendaItem.item.diasAteVencer)).length;

    return [
      { label: "Prazos na agenda", value: String(agendaItems.length), hint: "Obrigações e tarefas", tone: "text-sky-300", highlight: "neutral" },
      { label: "Pendentes no prazo", value: String(pendentesNoPrazo), hint: "Vencem em até 5 dias", tone: "text-amber-100", highlight: "warning" },
      { label: "Pendentes vencidos", value: String(pendentesVencidos), hint: "Já passaram do prazo", tone: "text-rose-100", highlight: "danger" },
    ];
  }, [agendaItems]);

  const insights = useMemo(() => {
    const proxima = agendaItems.find((agendaItem) => agendaItem.sortDate);
    const vencidas = agendaItems.filter((agendaItem) => isOverdue(agendaItem.item.diasAteVencer)).length;
    const semPrazo = activeObrigacoes.filter((obrigacao) => !normalizeText(obrigacao.prazo)).length;
    const proximaNome =
      proxima?.tipoAgenda === "tarefa"
        ? proxima.item.titulo
        : proxima?.tipoAgenda === "pessoal"
          ? proxima.item.tarefa.titulo
          : proxima?.item.nome;

    return [
      {
        title: proxima ? `Proxima entrega: ${proximaNome}` : "Proxima entrega",
        detail: proxima
          ? `${proxima.item.dataLabel}: ${formatDueDistance(proxima.item.diasAteVencer)}.`
          : "Ainda nao existe prazo suficiente para calcular a proxima data.",
        tone: "text-sky-300",
      },
      {
        title: "Pendências vencidas",
        detail: vencidas > 0 ? `${vencidas} itens já passaram do prazo e precisam de prioridade.` : "Nenhum item ativo está vencido.",
        tone: vencidas > 0 ? "text-rose-300" : "text-emerald-300",
      },
      {
        title: "Qualidade do prazo",
        detail: semPrazo > 0 ? `${semPrazo} obrigações ainda estão sem prazo preenchido.` : "Todas as obrigações ativas possuem prazo informado.",
        tone: semPrazo > 0 ? "text-amber-300" : "text-blue-300",
      },
    ];
  }, [activeObrigacoes, agendaItems]);

  return (
    <section className="mt-5 rounded-2xl border border-white/10 bg-[#061020]/88 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
      <div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-300">Agenda por data</p>
          <h2 className="mt-2 text-xl font-black">Agenda das proximas entregas</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
            Obrigações, tarefas do escritório e as suas tarefas do My Desktop aparecem juntas por data dentro da janela dos próximos 3 meses. O que vencer e não for finalizado permanece em vermelho até a conclusão. As tarefas pessoais só aparecem para quem as cadastrou.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 max-[1180px]:grid-cols-2 max-[640px]:grid-cols-1">
        {stats.map((stat) => {
          const isWarning = stat.highlight === "warning";
          const isDanger = stat.highlight === "danger";

          return (
            <article
              className={`rounded-xl border p-3 ${
                isWarning
                  ? "border-amber-300/40 bg-amber-300/15 shadow-[0_18px_40px_rgba(251,191,36,0.12)]"
                  : isDanger
                    ? "border-rose-300/40 bg-rose-300/15 shadow-[0_18px_40px_rgba(251,113,133,0.12)]"
                    : "border-white/10 bg-white/[0.05]"
              }`}
              key={stat.label}
            >
              <p className={`text-[11px] ${isWarning ? "text-amber-100" : isDanger ? "text-rose-100" : "text-slate-400"}`}>{stat.label}</p>
              <strong className={`mt-2 block text-2xl font-black ${stat.tone}`}>{stat.value}</strong>
              <span className={`mt-1 block text-[11px] ${isWarning ? "text-amber-100/75" : isDanger ? "text-rose-100/75" : "text-slate-500"}`}>{stat.hint}</span>
            </article>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_220px] gap-3 max-[760px]:grid-cols-1">
        <label className="flex min-h-10 items-center gap-2 rounded-lg border border-white/10 bg-slate-950/60 px-3">
          <svg className="size-4 text-sky-300" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="m21 21-4.3-4.3" strokeLinecap="round" />
            <path d="M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14" />
          </svg>
          <input
            className="w-full bg-transparent text-xs text-white outline-none placeholder:text-slate-600"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar obrigação, tarefa, setor, cliente ou data"
            type="search"
            value={search}
          />
        </label>
        <select
          className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-200 outline-none"
          onChange={(event) => setPeriodicidade(event.target.value)}
          value={periodicidade}
        >
          <option>Todas</option>
          {periodicidadeOrder.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>

      {feedback && <p className="mt-3 rounded-lg border border-rose-300/25 bg-rose-300/10 px-3 py-2 text-xs text-rose-100">{feedback}</p>}

      <div className="mt-4">
        <div className="max-h-[680px] overflow-auto rounded-xl border border-white/10 bg-slate-950/45">
          {isLoading ? (
            <div className="p-6 text-center text-xs text-slate-400">Carregando agenda...</div>
          ) : Object.keys(groupedByDate).length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">Nenhum item encontrado para os filtros atuais.</div>
          ) : (
            <div className="divide-y divide-white/10">
              {Object.entries(groupedByDate).map(([dateKey, items]) => {
                const [, dateLabel] = dateKey.split("|");
                const firstItem = items[0];

                return (
                  <section className="p-3" key={dateKey}>
                    <div className="sticky top-0 z-10 -mx-3 -mt-3 flex items-center justify-between gap-3 border-b border-white/10 bg-[#061020]/95 px-3 py-2 backdrop-blur">
                      <div className="flex items-center gap-2">
                        <span className={`grid size-7 place-items-center rounded-full border text-[11px] font-black ${getDueTone(firstItem?.item.diasAteVencer ?? null)}`}>
                          {items.length}
                        </span>
                        <div>
                          <strong className="block text-xs text-slate-100">{dateLabel}</strong>
                          <span className="text-[11px] text-slate-500">
                            {formatDueDistance(firstItem?.item.diasAteVencer ?? null)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2">
                      {items.map((agendaItem) => {
                        if (agendaItem.tipoAgenda === "pessoal") {
                          const ocorrencia = agendaItem.item;
                          const isPrazoPendente = isDueWithinFiveDays(ocorrencia.diasAteVencer);
                          const isPessoalVencida = isOverdue(ocorrencia.diasAteVencer);
                          const temClientes = ocorrencia.totalDeClientes > 0;
                          const isExpanded = expandedPessoalId === ocorrencia.chave;
                          const fundoPessoal = isPessoalVencida
                            ? "bg-rose-300/15"
                            : isPrazoPendente
                              ? "bg-amber-300/15"
                              : "bg-white/[0.035]";

                          const cabecalhoPessoal = (
                            <>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  {temClientes && (
                                    <span className={`grid size-5 place-items-center rounded-full text-[10px] font-black text-slate-950 ${isPessoalVencida ? "bg-rose-300" : isPrazoPendente ? "bg-amber-300" : "bg-emerald-300"}`}>
                                      {isExpanded ? "-" : "+"}
                                    </span>
                                  )}
                                  <strong className={`truncate text-xs ${isPessoalVencida ? "text-rose-50" : isPrazoPendente ? "text-amber-50" : "text-emerald-100"}`}>
                                    {ocorrencia.tarefa.titulo}
                                  </strong>
                                  <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2 py-0.5 text-[10px] font-bold text-emerald-100">
                                    Minha tarefa
                                  </span>
                                  <span className="rounded-full border border-white/10 bg-slate-950/65 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                                    Só você vê
                                  </span>
                                  {temClientes && (
                                    <span className="rounded-full border border-white/10 bg-slate-950/65 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                                      {ocorrencia.clientesPendentes.length} cliente(s)
                                    </span>
                                  )}
                                </div>
                                <p className={`mt-1 line-clamp-1 text-[11px] ${isPessoalVencida ? "text-rose-100/70" : isPrazoPendente ? "text-amber-100/70" : "text-slate-500"}`}>
                                  {ocorrencia.tarefa.descricao || "Tarefa cadastrada por você no My Desktop"}
                                </p>
                              </div>

                              <div className="flex flex-wrap items-center justify-end gap-2 text-[11px] max-[720px]:justify-start">
                                <span className="rounded-full border border-white/10 bg-slate-950/65 px-2 py-1 font-bold text-slate-300">
                                  {ocorrencia.tarefa.tipo === "Recorrente" ? ocorrencia.tarefa.recorrencia : "Única"}
                                </span>
                                <span className={`rounded-full border px-2 py-1 font-bold ${getDueTone(ocorrencia.diasAteVencer)}`}>
                                  {formatDueDistance(ocorrencia.diasAteVencer)}
                                </span>
                                {!temClientes && (
                                  <button
                                    className="min-h-7 rounded-md bg-emerald-300 px-2.5 text-[10px] font-black text-slate-950 transition hover:bg-emerald-200"
                                    onClick={() => setConfirmPessoalModal({ ocorrencia, cliente: null })}
                                    type="button"
                                  >
                                    Concluir
                                  </button>
                                )}
                              </div>
                            </>
                          );

                          // Com clientes a tarefa abre a lista e finaliza um por
                          // um, igual a obrigacao logo abaixo.
                          if (!temClientes) {
                            return (
                              <section
                                className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-white/10 px-3 py-2.5 max-[720px]:grid-cols-1 ${fundoPessoal}`}
                                key={`pessoal-${ocorrencia.chave}`}
                              >
                                {cabecalhoPessoal}
                              </section>
                            );
                          }

                          return (
                            <section className="rounded-lg border border-white/10 bg-slate-950/25" key={`pessoal-${ocorrencia.chave}`}>
                              <button
                                className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:brightness-125 max-[720px]:grid-cols-1 ${fundoPessoal}`}
                                onClick={() => setExpandedPessoalId((current) => (current === ocorrencia.chave ? null : ocorrencia.chave))}
                                type="button"
                              >
                                {cabecalhoPessoal}
                              </button>

                              {isExpanded && (
                                <div className="grid gap-2 border-t border-white/10 bg-slate-950/45 p-3">
                                  {ocorrencia.clientesPendentes.map((cliente) => (
                                    <div
                                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 max-[640px]:grid-cols-1"
                                      key={cliente.id}
                                    >
                                      <div className="min-w-0">
                                        <strong className="block truncate text-xs text-slate-100">{nomeDoCliente(cliente)}</strong>
                                        <span className="mt-1 block truncate text-[11px] text-slate-500">
                                          {cliente.identificacao || "Sem identificacao"} - {cliente.regime_tributario || "Sem regime"}
                                        </span>
                                      </div>
                                      <button
                                        className="min-h-7 rounded-md bg-emerald-300 px-2.5 text-[10px] font-black text-slate-950 transition hover:bg-emerald-200"
                                        onClick={() => setConfirmPessoalModal({ ocorrencia, cliente })}
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
                        }

                        if (agendaItem.tipoAgenda === "tarefa") {
                          const tarefa = agendaItem.item;
                          const isPrazoPendente = isDueWithinFiveDays(tarefa.diasAteVencer);
                          const isTarefaVencida = isOverdue(tarefa.diasAteVencer);
                          const tarefaAgendaKey = getTaskFinalizacaoKey(tarefa);
                          const isExpanded = expandedTarefaId === tarefaAgendaKey;
                          const clientesVinculados = getClientesDaTarefa(tarefa);

                          return (
                            <section className="rounded-lg border border-white/10 bg-slate-950/25" key={`tarefa-${tarefa.agendaKey}`}>
                              <button
                                className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 py-2.5 text-left transition max-[720px]:grid-cols-1 ${
                                  isTarefaVencida
                                    ? "bg-rose-300/15 hover:bg-rose-300/20"
                                    : isPrazoPendente
                                      ? "bg-amber-300/15 hover:bg-amber-300/20"
                                      : "bg-white/[0.035] hover:bg-white/[0.06]"
                                }`}
                                onClick={() => setExpandedTarefaId((current) => (current === tarefaAgendaKey ? null : tarefaAgendaKey))}
                                type="button"
                              >
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className={`grid size-5 place-items-center rounded-full text-[10px] font-black text-slate-950 ${isTarefaVencida ? "bg-rose-300" : isPrazoPendente ? "bg-amber-300" : "bg-violet-300"}`}>{isExpanded ? "-" : "+"}</span>
                                    <strong className={`truncate text-xs ${isTarefaVencida ? "text-rose-50" : isPrazoPendente ? "text-amber-50" : "text-violet-100"}`}>{tarefa.titulo}</strong>
                                    <span className="rounded-full border border-violet-300/25 bg-violet-300/10 px-2 py-0.5 text-[10px] font-bold text-violet-100">Tarefa</span>
                                    <span className="rounded-full border border-white/10 bg-slate-950/65 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                                      {clientesVinculados.length} cliente(s)
                                    </span>
                                  </div>
                                  <p className={`mt-1 line-clamp-1 text-[11px] ${isTarefaVencida ? "text-rose-100/70" : isPrazoPendente ? "text-amber-100/70" : "text-slate-500"}`}>
                                    {tarefa.setor} - Responsável: {tarefa.responsavel}
                                  </p>
                                </div>
                                <div className="flex flex-wrap items-center justify-end gap-2 text-[11px] max-[720px]:justify-start">
                                  <span className="rounded-full border border-white/10 bg-slate-950/65 px-2 py-1 font-bold text-slate-300">{tarefa.tipo === "Recorrente" ? tarefa.recorrencia : "Único"}</span>
                                  <span className={`rounded-full border px-2 py-1 font-bold ${getDueTone(tarefa.diasAteVencer)}`}>{formatDueDistance(tarefa.diasAteVencer)}</span>
                                </div>
                              </button>

                              {isExpanded && (
                                <div className="border-t border-white/10 bg-slate-950/45 p-3">
                                  {clientesVinculados.length === 0 ? (
                                    <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-slate-500">
                                      Nenhum cliente pendente para esta tarefa.
                                    </p>
                                  ) : (
                                    <div className="grid gap-2">
                                      {clientesVinculados.map((cliente) => (
                                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 max-[640px]:grid-cols-1" key={cliente}>
                                          <strong className="block truncate text-xs text-slate-100">{cliente}</strong>
                                          <button
                                            className="min-h-7 rounded-md bg-emerald-300 px-2.5 text-[10px] font-black text-slate-950 transition hover:bg-emerald-200"
                                            onClick={() => setConfirmModal({ tarefa, cliente })}
                                            type="button"
                                          >
                                            Finalizar
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </section>
                          );
                        }

                        const obrigacao = agendaItem.item;
                        const itemPeriodicidade = normalizeText(obrigacao.periodicidade) || "Sem periodicidade";
                        const isPrazoPendente = isDueWithinFiveDays(obrigacao.diasAteVencer);
                        const isObrigacaoVencida = isOverdue(obrigacao.diasAteVencer);
                        const obrigacaoAgendaKey = getFinalizacaoKey(obrigacao);
                        const isExpanded = expandedObrigacaoId === obrigacaoAgendaKey;
                        const clientesVinculados = getClientesDaObrigacao(obrigacao);

                        return (
                          <section className="rounded-lg border border-white/10 bg-slate-950/25" key={`obrigacao-${obrigacaoAgendaKey}`}>
                            <button
                              className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 py-2.5 text-left transition max-[720px]:grid-cols-1 ${
                                isObrigacaoVencida
                                  ? "bg-rose-300/15 hover:bg-rose-300/20"
                                  : isPrazoPendente
                                    ? "bg-amber-300/15 hover:bg-amber-300/20"
                                    : "bg-white/[0.035] hover:bg-white/[0.06]"
                              }`}
                              onClick={() => setExpandedObrigacaoId((current) => (current === obrigacaoAgendaKey ? null : obrigacaoAgendaKey))}
                              type="button"
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`grid size-5 place-items-center rounded-full text-[10px] font-black text-slate-950 ${isObrigacaoVencida ? "bg-rose-300" : isPrazoPendente ? "bg-amber-300" : "bg-sky-300"}`}>{isExpanded ? "-" : "+"}</span>
                                  <strong className={`truncate text-xs ${isObrigacaoVencida ? "text-rose-50" : isPrazoPendente ? "text-amber-50" : "text-sky-100"}`}>{obrigacao.nome}</strong>
                                  <span className="rounded-full border border-sky-300/25 bg-sky-300/10 px-2 py-0.5 text-[10px] font-bold text-sky-100">Obrigação</span>
                                  <span className="rounded-full border border-white/10 bg-slate-950/65 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                                    {clientesVinculados.length} empresa(s)
                                  </span>
                                </div>
                                <p className={`mt-1 line-clamp-1 text-[11px] ${isObrigacaoVencida ? "text-rose-100/70" : isPrazoPendente ? "text-amber-100/70" : "text-slate-500"}`}>
                                  {normalizeText(obrigacao.setor) || "Sem setor"} - {normalizeText(obrigacao.regime) || "Sem regime informado"}
                                </p>
                              </div>

                              <div className="flex flex-wrap items-center justify-end gap-2 text-[11px] max-[720px]:justify-start">
                                <span className={`rounded-full border px-2 py-1 font-bold ${getTone(itemPeriodicidade)}`}>{itemPeriodicidade}</span>
                                <span className={`rounded-full border px-2 py-1 font-bold ${getDueTone(obrigacao.diasAteVencer)}`}>
                                  {formatDueDistance(obrigacao.diasAteVencer)}
                                </span>
                                <span className="rounded-full border border-white/10 bg-slate-950/70 px-2 py-1 text-slate-300">
                                  Prazo cadastrado: {normalizeText(obrigacao.prazo) || "não informado"}
                                </span>
                              </div>
                            </button>

                            {isExpanded && (
                              <div className="border-t border-white/10 bg-slate-950/45 p-3">
                                {clientesVinculados.length === 0 ? (
                                  <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-slate-500">
                                    Nenhuma empresa pendente para esta obrigação pelos vínculos do cadastro de clientes.
                                  </p>
                                ) : (
                                  <div className="grid gap-2">
                                    {clientesVinculados.map((cliente) => (
                                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 max-[640px]:grid-cols-1" key={cliente.id}>
                                        <div className="min-w-0">
                                          <strong className="block truncate text-xs text-slate-100">{cliente.razao_social}</strong>
                                          <span className="mt-1 block truncate text-[11px] text-slate-500">
                                            {cliente.identificacao || "Sem identificacao"} - {cliente.regime_tributario || "Sem regime"}
                                          </span>
                                        </div>
                                        <button
                                          className="min-h-7 rounded-md bg-emerald-300 px-2.5 text-[10px] font-black text-slate-950 transition hover:bg-emerald-200"
                                          onClick={() => setConfirmObrigacaoModal({ obrigacao, cliente })}
                                          type="button"
                                        >
                                          Finalizar
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
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
      </div>

      {confirmModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/78 backdrop-blur-sm" suppressHydrationWarning>
          <div className="rounded-2xl border border-white/10 bg-[#061020] p-6 shadow-2xl max-w-sm">
            <h2 className="text-lg font-black text-slate-100">Confirmar Finalização</h2>
            <p className="mt-3 text-sm text-slate-300">
              Deseja realmente finalizar esta tarefa para <strong>{confirmModal.cliente}</strong>?
            </p>
            <div className="mt-6 flex gap-3 justify-end">
              <button
                className="min-h-10 rounded-lg border border-white/10 px-4 text-xs font-bold text-slate-200 transition hover:border-sky-300/40 hover:text-sky-100"
                onClick={() => setConfirmModal(null)}
                type="button"
              >
                Não
              </button>
              <button
                className="min-h-10 rounded-lg bg-emerald-300 px-4 text-xs font-black text-slate-950 transition hover:bg-emerald-200"
                onClick={() => {
                  if (confirmModal) {
                    finalizarClienteTarefa(confirmModal.tarefa, confirmModal.cliente);
                    setConfirmModal(null);
                  }
                }}
                type="button"
              >
                Sim
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmPessoalModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/78 backdrop-blur-sm" suppressHydrationWarning>
          <div className="rounded-2xl border border-white/10 bg-[#061020] p-6 shadow-2xl max-w-sm">
            <h2 className="text-lg font-black text-slate-100">
              Confirmar {confirmPessoalModal.cliente ? "Finalização" : "Conclusão"}
            </h2>
            <p className="mt-3 text-sm text-slate-300">
              {confirmPessoalModal.cliente ? (
                <>
                  Finalizar <strong>{confirmPessoalModal.ocorrencia.tarefa.titulo}</strong> para{" "}
                  <strong>{nomeDoCliente(confirmPessoalModal.cliente)}</strong> em {confirmPessoalModal.ocorrencia.dataLabel}?
                </>
              ) : (
                <>
                  Concluir <strong>{confirmPessoalModal.ocorrencia.tarefa.titulo}</strong> em{" "}
                  {confirmPessoalModal.ocorrencia.dataLabel}?
                </>
              )}
              {confirmPessoalModal.ocorrencia.tarefa.tipo === "Recorrente" && (
                <span className="mt-2 block text-xs text-slate-500">
                  A tarefa continua valendo para as próximas datas da recorrência.
                </span>
              )}
            </p>
            <div className="mt-6 flex gap-3 justify-end">
              <button
                className="min-h-10 rounded-lg border border-white/10 px-4 text-xs font-bold text-slate-200 transition hover:border-sky-300/40 hover:text-sky-100"
                onClick={() => setConfirmPessoalModal(null)}
                type="button"
              >
                Não
              </button>
              <button
                className="min-h-10 rounded-lg bg-emerald-300 px-4 text-xs font-black text-slate-950 transition hover:bg-emerald-200"
                onClick={() => {
                  concluirTarefaPessoal(confirmPessoalModal.ocorrencia, confirmPessoalModal.cliente);
                  setConfirmPessoalModal(null);
                }}
                type="button"
              >
                Sim
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmObrigacaoModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/78 backdrop-blur-sm" suppressHydrationWarning>
          <div className="rounded-2xl border border-white/10 bg-[#061020] p-6 shadow-2xl max-w-sm">
            <h2 className="text-lg font-black text-slate-100">Confirmar Finalização</h2>
            <p className="mt-3 text-sm text-slate-300">
              {/* Pelo nome fantasia sozinho, cliente sem fantasia preenchida
                  saia em branco. A lista acima ja mostra a razao social. */}
              Deseja realmente finalizar esta obrigação para <strong>{nomeDoCliente(confirmObrigacaoModal.cliente)}</strong>?
            </p>
            <div className="mt-6 flex gap-3 justify-end">
              <button
                className="min-h-10 rounded-lg border border-white/10 px-4 text-xs font-bold text-slate-200 transition hover:border-sky-300/40 hover:text-sky-100"
                onClick={() => setConfirmObrigacaoModal(null)}
                type="button"
              >
                Não
              </button>
              <button
                className="min-h-10 rounded-lg bg-emerald-300 px-4 text-xs font-black text-slate-950 transition hover:bg-emerald-200"
                onClick={() => {
                  if (confirmObrigacaoModal) {
                    finalizarClienteObrigacao(confirmObrigacaoModal.obrigacao, confirmObrigacaoModal.cliente);
                    setConfirmObrigacaoModal(null);
                  }
                }}
                type="button"
              >
                Sim
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}








