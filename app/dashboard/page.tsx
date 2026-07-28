import Image from "next/image";
import Link from "next/link";
import ErpSidebar from "../components/ErpSidebar";
import DashboardAgendaObrigacoes from "../components/DashboardAgendaObrigacoes";
import { LogoffLink } from "../components/TopbarUser";

const metrics = [
  { label: "Obrigações do mês", value: "186", hint: "Fiscal, contábil e pessoal", tone: "text-sky-300" },
  { label: "Entregas concluídas", value: "142", hint: "76% da rotina mensal", tone: "text-blue-300" },
  { label: "Pendências de clientes", value: "31", hint: "Documentos aguardando", tone: "text-amber-300" },
  { label: "Vencem em 7 dias", value: "18", hint: "Prioridade da agenda fiscal", tone: "text-violet-300" },
];

const cadastroItems = [
  "Obrigações",
  "Tarefas",
  "Clientes",
  "Grupo de clientes",
  "Setores",
  "Usuários",
];

const configuracaoItems = [
  { label: "Dados da empresa", href: "/configuracoes/dados-empresa" },
];

const vinculoItems = [
  { label: "Clientes", href: "/cadastros/clientes" },
  { label: "Grupo de clientes", href: "/cadastros/grupo-clientes" },
];

const relatorioItems = [
  { label: "Obrigações finalizadas", href: "/relatorios/obrigacoes-finalizadas" },
];

const moduleIcons = ["dashboard", "tasks", "accounting", "tax", "people", "calendar", "finance"];

const modules = [
  "Dashboard",
  "Gestão de Tarefas",
  "Contábil",
  "Fiscal/Tributário",
  "Trabalhista/Pessoal",
  "Agenda Fiscal",
  "Financeiro",
];

const routineFlow = [
  { month: "Seg", done: 68, pending: 42 },
  { month: "Ter", done: 74, pending: 38 },
  { month: "Qua", done: 82, pending: 36 },
  { month: "Qui", done: 93, pending: 31 },
  { month: "Sex", done: 88, pending: 28 },
  { month: "Prox", done: 62, pending: 54 },
];

const moduleCards = [
  { title: "Financeiro", detail: "Honorários, contas a receber, repasses e inadimplência.", count: "24 lanç.", color: "text-sky-300" },
  { title: "Contábil", detail: "Balancetes, conciliação, fechamentos e demonstrativos.", count: "38 rotinas", color: "text-blue-300" },
  { title: "Fiscal/Tributário", detail: "Notas, apurações, guias, SPED e obrigações acessórias.", count: "57 tarefas", color: "text-violet-300" },
  { title: "Trabalhista/Pessoal", detail: "Folha, admissão, férias, rescisão, eSocial e pró-labore.", count: "29 tarefas", color: "text-amber-300" },
  { title: "Agenda Fiscal", detail: "Calendário de vencimentos, alertas e prioridades do mês.", count: "18 prazos", color: "text-rose-300" },
];

const tasks = [
  { title: "Fechamento fiscal", detail: "18 empresas até 30/06", progress: "76%" },
  { title: "Fechamento contábil", detail: "9 balancetes em revisão", progress: "64%" },
  { title: "Folha mensal", detail: "12 folhas em validação", progress: "58%" },
  { title: "Agenda fiscal", detail: "18 prazos nos próximos 7 dias", progress: "41%" },
];

const routines = [
  { client: "Alfa Comércio Ltda", module: "Fiscal/Tributário", routine: "Apuração Simples Nacional", due: "Hoje", owner: "Camila", status: "Prioridade" },
  { client: "Clínica Horizonte", module: "Trabalhista/Pessoal", routine: "Fechamento da folha", due: "28/06", owner: "Renato", status: "Em andamento" },
  { client: "NovaRota Transportes", module: "Contábil", routine: "Conciliação bancária", due: "29/06", owner: "Mariana", status: "A revisar" },
  { client: "Studio Pixel ME", module: "Financeiro", routine: "Cobrança de honorários", due: "03/07", owner: "Julia", status: "Aguardando cliente" },
  { client: "Mercado Vale Sul", module: "Agenda Fiscal", routine: "DCTFWeb e guia INSS", due: "07/07", owner: "Paulo", status: "Programado" },
];

const insights = [
  { title: "Risco de atraso", detail: "7 clientes ainda nao enviaram notas fiscais para a apuracao do mes.", action: "Cobrar documentos", tone: "text-amber-300" },
  { title: "Ganho rápido", detail: "12 tarefas recorrentes podem ser criadas automaticamente no próximo ciclo.", action: "Gerar recorrências", tone: "text-blue-300" },
  { title: "Alerta financeiro", detail: "3 clientes com honorários vencidos também possuem entregas críticas nesta semana.", action: "Priorizar contato", tone: "text-rose-300" },
];

const clientHealth = [
  { label: "Clientes em dia", value: "64", percent: "78%", color: "bg-sky-300" },
  { label: "Com pendencia documental", value: "14", percent: "17%", color: "bg-amber-300" },
  { label: "Com prazo critico", value: "4", percent: "5%", color: "bg-rose-300" },
];

const ideas = [
  "Portal do cliente para envio de documentos, notas e extratos por competência.",
  "Checklist automático por regime tributário: MEI, Simples Nacional, Lucro Presumido e Lucro Real.",
  "Radar de certidões, procurações digitais e certificados próximos do vencimento.",
  "SLA interno por setor para medir tempo de resposta, revisão e entrega.",
  "Esteira de onboarding para abertura, alteração e baixa de empresas.",
  "Resumo executivo mensal enviado ao cliente com pendências, impostos e indicadores.",
];

const taskStats = [
  { label: "Tarefas vencidas", value: "9", hint: "4 por atraso interno", color: "text-rose-300" },
  { label: "Vencem hoje", value: "23", hint: "12 aguardam revisao", color: "text-amber-300" },
  { label: "SLA geral", value: "91%", hint: "+6 pts na semana", color: "text-sky-300" },
  { label: "Recorrentes geradas", value: "312", hint: "Competencia 06/2026", color: "text-violet-300" },
];

const kanbanColumns = [
  {
    title: "Nova",
    count: 18,
    items: ["DAS Simples - Alfa Comercio", "Pro-labore - Studio Pixel"],
    color: "border-sky-300/30",
  },
  {
    title: "Em andamento",
    count: 34,
    items: ["Conciliacao - NovaRota", "DCTFWeb - Mercado Vale Sul"],
    color: "border-violet-300/30",
  },
  {
    title: "Aguardando cliente",
    count: 21,
    items: ["Extrato bancário - Clínica Horizonte", "XML entrada - Alfa Comércio"],
    color: "border-amber-300/30",
  },
  {
    title: "Revisão",
    count: 12,
    items: ["Folha mensal - Clinica Horizonte", "Balancete - NovaRota"],
    color: "border-blue-300/30",
  },
  {
    title: "Concluida",
    count: 142,
    items: ["Envio DAS - Studio Pixel", "Certidão municipal - Mercado Vale Sul"],
    color: "border-slate-300/20",
  },
];

const productivity = [
  { name: "Camila", role: "Fiscal", done: 42, sla: "96%", delay: 1 },
  { name: "Renato", role: "Pessoal", done: 31, sla: "89%", delay: 3 },
  { name: "Mariana", role: "Contabil", done: 28, sla: "93%", delay: 2 },
  { name: "Julia", role: "Financeiro", done: 24, sla: "91%", delay: 1 },
];

const clientPendencies = [
  { client: "Alfa Comércio Ltda", pending: "Notas de entrada", days: "3 dias", impact: "Apuração fiscal" },
  { client: "Clinica Horizonte", pending: "Eventos de folha", days: "2 dias", impact: "eSocial" },
  { client: "NovaRota Transportes", pending: "Extrato bancário", days: "5 dias", impact: "Fechamento contábil" },
];

const workflowSteps = [
  "Rotina recorrente cadastrada",
  "Tarefa gerada por competencia",
  "Responsavel e checklist definidos",
  "SLA interno acompanhado",
  "Revisão e entrega ao cliente",
];

function ModuleIcon({ icon }: { icon: string }) {
  const commonProps = {
    className: "size-4 text-sky-300 drop-shadow-[0_0_8px_rgba(56,189,248,0.75)]",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 2,
    viewBox: "0 0 24 24",
  };

  if (icon === "dashboard") {
    return (
      <svg {...commonProps}>
        <path d="M4 4h7v7H4z" />
        <path d="M13 4h7v4h-7z" />
        <path d="M13 10h7v10h-7z" />
        <path d="M4 13h7v7H4z" />
      </svg>
    );
  }

  if (icon === "tasks") {
    return (
      <svg {...commonProps}>
        <path d="M9 6h11" />
        <path d="M9 12h11" />
        <path d="M9 18h11" />
        <path d="m4 6 1 1 2-2" />
        <path d="m4 12 1 1 2-2" />
        <path d="m4 18 1 1 2-2" />
      </svg>
    );
  }

  if (icon === "finance") {
    return (
      <svg {...commonProps}>
        <path d="M12 2v20" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    );
  }

  if (icon === "accounting") {
    return (
      <svg {...commonProps}>
        <path d="M6 2h9l3 3v17H6z" />
        <path d="M14 2v5h4" />
        <path d="M9 12h6" />
        <path d="M9 16h6" />
      </svg>
    );
  }

  if (icon === "tax") {
    return (
      <svg {...commonProps}>
        <path d="M4 4h16v16H4z" />
        <path d="M8 8h8" />
        <path d="M8 12h3" />
        <path d="M14 12h2" />
        <path d="M8 16h8" />
      </svg>
    );
  }

  if (icon === "people") {
    return (
      <svg {...commonProps}>
        <path d="M16 11a4 4 0 1 0-8 0" />
        <path d="M5 21a7 7 0 0 1 14 0" />
        <path d="M18 8a3 3 0 0 1 3 3" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="M7 2v4" />
      <path d="M17 2v4" />
      <path d="M4 8h16" />
      <path d="M5 5h14v16H5z" />
      <path d="M8 12h3" />
      <path d="M13 16h3" />
    </svg>
  );
}

export default function Dashboard() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#070b16] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(34,211,238,0.26),transparent_30%),radial-gradient(circle_at_84%_8%,rgba(167,139,250,0.28),transparent_32%),radial-gradient(circle_at_62%_78%,rgba(56,189,248,0.14),transparent_34%),linear-gradient(135deg,#061020_0%,#080b18_48%,#12091f_100%)]" />
      <div className="relative grid min-h-screen grid-cols-[236px_minmax(0,1fr)] max-[980px]:grid-cols-1">
        <ErpSidebar />
        <aside className="hidden border-r border-white/10 bg-[#061020] px-4 py-5 max-[980px]:border-b max-[980px]:border-r-0">
          <div className="flex justify-center">
            <Image
              src="/logo-riseup-branca.png"
              alt="Tatiane Fontes Assessoria Contábil"
              width={220}
              height={220}
              priority
              className="h-auto w-52 max-w-full object-contain"
            />
          </div>

          <nav className="mt-5 grid gap-1.5 max-[980px]:grid-cols-3 max-[640px]:grid-cols-2">
            {modules.map((item, index) => (
              <button
                className={`flex min-h-10 items-center justify-between rounded-lg border px-3 text-left text-sm font-normal leading-none transition ${
                  index === 0
                    ? "border-sky-300/35 bg-sky-300/12 text-sky-100"
                    : "border-transparent text-slate-300 hover:border-white/10 hover:bg-white/[0.06]"
                }`}
                key={item}
                type="button"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ModuleIcon icon={moduleIcons[index]} />
                  <span className="truncate">{item}</span>
                </span>
              </button>
            ))}
          </nav>

          <section className="mt-6 rounded-xl border border-white/10 bg-slate-950/60 p-3">
            <p className="text-[11px] font-semibold uppercase text-slate-500">Saúde operacional</p>
            <p className="mt-2 text-xl font-black">87%</p>
            <div className="mt-3 h-1.5 rounded-full bg-white/10">
              <div className="h-1.5 w-[87%] rounded-full bg-sky-300" />
            </div>
            <p className="mt-3 text-[11px] leading-5 text-slate-400">
              Financeiro, contábil, fiscal, pessoal e agenda fiscal em uma fila única.
            </p>
          </section>
        </aside>

        <section className="min-w-0 px-6 pb-5 pt-3 max-[640px]:px-4">
          <div className="relative z-30 mb-4 flex min-h-9 items-center justify-end rounded-xl border border-white/10 bg-[#061020]/88 px-2.5 backdrop-blur-xl max-[640px]:py-2">
            <div className="flex flex-row-reverse items-center gap-2">
              <LogoffLink />

              <div className="group relative after:absolute after:left-0 after:right-0 after:top-8 after:h-3 after:content-['']">
                <button
                  className="flex min-h-8 items-center gap-1.5 px-1.5 text-[15px] font-normal text-slate-300 transition hover:text-sky-100"
                  type="button"
                >
                  <svg
                    className="size-4 text-sky-300 drop-shadow-[0_0_8px_rgba(56,189,248,0.75)]"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5" />
                    <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.05.05a2 2 0 1 1-2.83 2.83l-.05-.05a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.65V21a2 2 0 1 1-4 0v-.1a1.8 1.8 0 0 0-1.1-1.65 1.8 1.8 0 0 0-1.98.36l-.05.05a2 2 0 1 1-2.83-2.83l.05-.05A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.65-1.1H3a2 2 0 1 1 0-4h.1A1.8 1.8 0 0 0 4.75 8.8a1.8 1.8 0 0 0-.36-1.98l-.05-.05a2 2 0 1 1 2.83-2.83l.05.05a1.8 1.8 0 0 0 1.98.36A1.8 1.8 0 0 0 10.3 2.7V2a2 2 0 1 1 4 0v.1a1.8 1.8 0 0 0 1.1 1.65 1.8 1.8 0 0 0 1.98-.36l.05-.05a2 2 0 1 1 2.83 2.83l-.05.05a1.8 1.8 0 0 0-.36 1.98 1.8 1.8 0 0 0 1.65 1.1H21a2 2 0 1 1 0 4h-.1A1.8 1.8 0 0 0 19.4 15" />
                  </svg>
                  <span>Configurações</span>
                  <svg className="size-3 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                <div className="invisible absolute right-0 top-9 w-52 rounded-xl border border-white/10 bg-[#061020]/96 p-2 opacity-0 shadow-2xl shadow-black/35 backdrop-blur-xl transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                  {configuracaoItems.map((item) => (
                    <Link
                      className="flex min-h-8 w-full items-center justify-between rounded-lg px-2.5 text-left text-[15px] font-normal text-slate-300 transition hover:bg-white/[0.06] hover:text-sky-100"
                      href={item.href}
                      key={item.label}
                    >
                      <span>{item.label}</span>
                      <span className="text-sky-300">+</span>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="group relative after:absolute after:left-0 after:right-0 after:top-8 after:h-3 after:content-['']">
                <button
                  className="flex min-h-8 items-center gap-1.5 px-1.5 text-[15px] font-normal text-slate-300 transition hover:text-sky-100"
                  type="button"
                >
                  <svg
                    className="size-4 text-sky-300 drop-shadow-[0_0_8px_rgba(56,189,248,0.75)]"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path d="M4 19.5V4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5Z" />
                    <path d="M8 7h8" />
                    <path d="M8 11h8" />
                    <path d="M8 15h5" />
                  </svg>
                  <span>Relatorios</span>
                  <svg className="size-3 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                <div className="invisible absolute right-0 top-9 w-64 rounded-xl border border-white/10 bg-[#061020]/96 p-2 opacity-0 shadow-2xl shadow-black/35 backdrop-blur-xl transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                  {relatorioItems.map((item) => (
                    <Link
                      className="flex min-h-8 w-full items-center justify-between rounded-lg px-2.5 text-left text-[15px] font-normal text-slate-300 transition hover:bg-white/[0.06] hover:text-sky-100"
                      href={item.href}
                      key={item.label}
                    >
                      <span>{item.label}</span>
                      <span className="text-sky-300">+</span>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="group relative after:absolute after:left-0 after:right-0 after:top-8 after:h-3 after:content-['']">
                <button
                  className="flex min-h-8 items-center gap-1.5 px-1.5 text-[15px] font-normal text-slate-300 transition hover:text-sky-100"
                  type="button"
                >
                  <svg
                    className="size-4 text-sky-300 drop-shadow-[0_0_8px_rgba(56,189,248,0.75)]"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path d="M10 13a5 5 0 0 0 7.1 0l2.1-2.1a5 5 0 0 0-7.1-7.1L11 4.9" />
                    <path d="M14 11a5 5 0 0 0-7.1 0l-2.1 2.1a5 5 0 0 0 7.1 7.1l1.1-1.1" />
                  </svg>
                  <span>Vinculos</span>
                  <svg className="size-3 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                <div className="invisible absolute right-0 top-9 w-60 rounded-xl border border-white/10 bg-[#061020]/96 p-2 opacity-0 shadow-2xl shadow-black/35 backdrop-blur-xl transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                  {vinculoItems.map((item) => (
                    <Link
                      className="flex min-h-8 w-full items-center justify-between rounded-lg px-2.5 text-left text-[15px] font-normal text-slate-300 transition hover:bg-white/[0.06] hover:text-sky-100"
                      href={item.href}
                      key={item.label}
                    >
                      <span>{item.label}</span>
                      <span className="text-sky-300">+</span>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="group relative after:absolute after:left-0 after:right-0 after:top-8 after:h-3 after:content-['']">
                <button
                  className="flex min-h-8 items-center gap-1.5 px-1.5 text-[15px] font-normal text-slate-300 transition hover:text-sky-100"
                  type="button"
                >
                  <svg
                    className="size-4 text-sky-300 drop-shadow-[0_0_8px_rgba(56,189,248,0.75)]"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path d="M4 5h16" />
                    <path d="M4 12h16" />
                    <path d="M4 19h16" />
                  </svg>
                  <span>Cadastro</span>
                  <svg className="size-3 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                <div className="invisible absolute right-0 top-9 w-60 rounded-xl border border-white/10 bg-[#061020]/96 p-2 opacity-0 shadow-2xl shadow-black/35 backdrop-blur-xl transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                  {cadastroItems.map((item) => (
                    <Link
                      className="flex min-h-8 w-full items-center justify-between rounded-lg px-2.5 text-left text-[15px] font-normal text-slate-300 transition hover:bg-white/[0.06] hover:text-sky-100"
                      href={
                        item === "Obrigações"
                          ? "/cadastros/obrigacoes"
                          : item === "Tarefas"
                            ? "/cadastros/tarefas"
                          : item === "Clientes"
                            ? "/cadastros/clientes"
                          : item === "Usuários"
                            ? "/cadastros/usuarios"
                          : item === "Setores"
                            ? "/cadastros/setores"
                          : item === "Grupo de clientes"
                            ? "/cadastros/grupo-clientes"
                            : "#"
                      }
                      key={item}
                    >
                      <span>{item}</span>
                      <span className="text-sky-300">+</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <header className="flex items-center justify-between gap-4 max-[760px]:items-start max-[760px]:flex-col">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-300">Dashboard do ERP</p>
              <h1 className="mt-2 max-w-3xl text-2xl font-black leading-tight tracking-normal max-[760px]:text-xl">
                Visão inteligente das rotinas do escritório
              </h1>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-400">
                Controle prazos, gargalos, documentos pendentes, entregas por setor e riscos antes que virem urgência.
              </p>
            </div>
          </header>

          <div className="w-full">
            <DashboardAgendaObrigacoes />
            {/* Dashboard principal com obrigações ocupando toda largura */}
          </div>

          <section className="mt-4 w-full rounded-2xl border border-white/10 bg-slate-950/55 p-4 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3 max-[640px]:items-start max-[640px]:flex-col">
              <div>
                <h2 className="text-base font-black">Ideias para evoluir a rotina</h2>
                <p className="mt-1 text-xs text-slate-400">Funcionalidades que podem virar os proximos modulos do sistema.</p>
              </div>
              <span className="rounded-full border border-violet-300/30 bg-violet-300/10 px-3 py-1 text-[11px] font-bold text-violet-200">
                Roadmap
              </span>
            </div>
            <div className="mt-4 grid w-full grid-cols-3 gap-3 max-[980px]:grid-cols-2 max-[620px]:grid-cols-1">
              {ideas.map((idea) => (
                <article className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs leading-5 text-slate-300" key={idea}>
                  {idea}
                </article>
              ))}
            </div>
          </section>

          <section className="mt-5 rounded-2xl border border-sky-300/20 bg-slate-950/60 p-4 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3 max-[760px]:items-start max-[760px]:flex-col">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-300">Gestão de Tarefas</p>
                <h2 className="mt-2 text-xl font-black">Central operacional RiseUp</h2>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
                  Controle rotinas recorrentes, checklists, workflows, SLA, Kanban, produtividade da equipe e pendências por cliente em uma única esteira.
                </p>
              </div>
              <button className="min-h-9 rounded-lg bg-violet-300 px-3 text-xs font-black text-slate-950" type="button">
                Criar rotina recorrente
              </button>
            </div>

            <div className="mt-4 grid grid-cols-4 gap-3 max-[1180px]:grid-cols-2 max-[640px]:grid-cols-1">
              {taskStats.map((stat) => (
                <article className="rounded-xl border border-white/10 bg-white/[0.05] p-3" key={stat.label}>
                  <p className="text-[11px] text-slate-400">{stat.label}</p>
                  <strong className={`mt-2 block text-xl font-black ${stat.color}`}>{stat.value}</strong>
                  <span className="mt-1 block text-[11px] text-slate-500">{stat.hint}</span>
                </article>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-5 gap-3 max-[1280px]:grid-cols-3 max-[900px]:grid-cols-1">
              {kanbanColumns.map((column) => (
                <article className={`rounded-xl border ${column.color} bg-[#071120] p-3`} key={column.title}>
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-xs">{column.title}</strong>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-slate-300">{column.count}</span>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {column.items.map((item) => (
                      <div className="rounded-lg border border-white/10 bg-white/[0.04] p-2 text-[11px] leading-4 text-slate-300" key={item}>
                        {item}
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(280px,0.65fr)] gap-4 max-[1120px]:grid-cols-1">
              <section className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black">Produtividade por colaborador</h3>
                    <p className="mt-1 text-[11px] text-slate-500">Volume, SLA e atrasos por responsavel.</p>
                  </div>
                  <span className="rounded-full border border-sky-300/25 bg-sky-300/10 px-2.5 py-1 text-[11px] font-bold text-sky-200">
                    Ranking
                  </span>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[520px] border-collapse">
                    <thead>
                      <tr className="text-left text-[11px] uppercase text-slate-500">
                        <th className="border-b border-white/10 py-2 font-black">Colaborador</th>
                        <th className="border-b border-white/10 py-2 font-black">Setor</th>
                        <th className="border-b border-white/10 py-2 font-black">Concluidas</th>
                        <th className="border-b border-white/10 py-2 font-black">SLA</th>
                        <th className="border-b border-white/10 py-2 font-black">Atrasos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productivity.map((person) => (
                        <tr className="text-xs" key={person.name}>
                          <td className="border-b border-white/10 py-2.5 font-bold">{person.name}</td>
                          <td className="border-b border-white/10 py-2.5 text-slate-400">{person.role}</td>
                          <td className="border-b border-white/10 py-2.5 text-slate-300">{person.done}</td>
                          <td className="border-b border-white/10 py-2.5 text-sky-300">{person.sla}</td>
                          <td className="border-b border-white/10 py-2.5 text-amber-300">{person.delay}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <h3 className="text-sm font-black">Workflow padrao</h3>
                <p className="mt-1 text-[11px] text-slate-500">Esteira sugerida para rotinas repetitivas.</p>
                <div className="mt-3 grid gap-2">
                  {workflowSteps.map((step, index) => (
                    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/50 p-2 text-[11px] text-slate-300" key={step}>
                      <span className="grid size-5 place-items-center rounded-full bg-sky-300/15 text-[10px] font-black text-sky-200">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <section className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <div className="flex items-center justify-between gap-3 max-[720px]:items-start max-[720px]:flex-col">
                <div>
                  <h3 className="text-sm font-black">Pendencias por cliente</h3>
                  <p className="mt-1 text-[11px] text-slate-500">Separe atraso interno de atraso causado por falta de documento do cliente.</p>
                </div>
                <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-[11px] font-bold text-amber-200">
                  Aguardando cliente
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 max-[900px]:grid-cols-1">
                {clientPendencies.map((item) => (
                  <article className="rounded-lg border border-white/10 bg-slate-950/50 p-3" key={item.client}>
                    <strong className="text-xs">{item.client}</strong>
                    <p className="mt-2 text-[11px] text-slate-400">{item.pending}</p>
                    <div className="mt-3 flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-amber-300">{item.days}</span>
                      <span className="text-slate-500">{item.impact}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </section>

          <div className="mt-5 grid grid-cols-4 gap-3 max-[1180px]:grid-cols-2 max-[640px]:grid-cols-1">
            {metrics.map((metric) => (
              <article className="rounded-xl border border-white/10 bg-white/[0.06] p-4 shadow-2xl shadow-black/20 backdrop-blur" key={metric.label}>
                <p className="text-xs text-slate-400">{metric.label}</p>
                <strong className={`mt-2 block text-2xl font-black ${metric.tone}`}>{metric.value}</strong>
                <span className="mt-1.5 block text-[11px] text-slate-500">{metric.hint}</span>
              </article>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-[minmax(0,1fr)_340px] gap-4 max-[1120px]:grid-cols-1">
            <section className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-3 max-[640px]:flex-col">
                <div>
                  <h2 className="text-base font-black">Insights do dia</h2>
                  <p className="mt-1 text-xs text-slate-400">Alertas gerenciais para evitar retrabalho e atraso.</p>
                </div>
                <span className="rounded-full border border-sky-300/30 bg-sky-300/10 px-3 py-1 text-[11px] font-bold text-sky-200">
                  3 recomendacoes
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 max-[900px]:grid-cols-1">
                {insights.map((insight) => (
                  <article className="rounded-xl border border-white/10 bg-slate-950/50 p-3" key={insight.title}>
                    <strong className={`text-xs ${insight.tone}`}>{insight.title}</strong>
                    <p className="mt-2 text-[11px] leading-5 text-slate-400">{insight.detail}</p>
                    <button className="mt-3 min-h-8 rounded-lg border border-white/10 px-3 text-[11px] font-bold text-slate-200" type="button">
                      {insight.action}
                    </button>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-slate-950/55 p-4 backdrop-blur-xl">
              <h2 className="text-base font-black">Saúde da carteira</h2>
              <p className="mt-1 text-xs text-slate-400">Distribuição dos clientes por risco operacional.</p>
              <div className="mt-4 grid gap-3">
                {clientHealth.map((item) => (
                  <div key={item.label}>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-slate-300">{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-white/10">
                      <div className={`h-1.5 rounded-full ${item.color}`} style={{ width: item.percent }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="mt-4 grid grid-cols-5 gap-3 max-[1280px]:grid-cols-3 max-[840px]:grid-cols-2 max-[560px]:grid-cols-1">
            {moduleCards.map((module) => (
              <article className="rounded-xl border border-white/10 bg-slate-950/45 p-3 backdrop-blur" key={module.title}>
                <div className="flex items-center justify-between gap-3">
                  <strong className="text-xs">{module.title}</strong>
                  <span className={`text-xs font-black ${module.color}`}>{module.count}</span>
                </div>
                <p className="mt-2 text-[11px] leading-5 text-slate-400">{module.detail}</p>
              </article>
            ))}
          </section>

          <div className="mt-4 grid grid-cols-[minmax(0,1.45fr)_minmax(320px,0.8fr)] gap-4 max-[1120px]:grid-cols-1">
            <section className="rounded-2xl border border-white/10 bg-slate-950/55 p-4 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-black">Producao semanal</h2>
              <p className="mt-1 text-xs text-slate-400">Rotinas concluídas e pendentes por dia.</p>
                </div>
                <span className="rounded-full border border-sky-300/30 bg-sky-300/10 px-3 py-1 text-[11px] font-bold text-sky-200">
                  Em dia
                </span>
              </div>

              <div className="mt-5 grid h-56 grid-cols-6 items-end gap-3 border-b border-white/10 pb-3">
                {routineFlow.map((item) => (
                  <div className="grid gap-3" key={item.month}>
                    <div className="grid h-44 grid-cols-2 items-end gap-1.5">
                      <div className="rounded-t-lg bg-sky-300" style={{ height: `${item.done}%` }} />
                      <div className="rounded-t-xl bg-violet-400" style={{ height: `${item.pending}%` }} />
                    </div>
                    <span className="text-center text-xs font-semibold text-slate-500">{item.month}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-xl">
              <h2 className="text-base font-black">Agenda operacional</h2>
              <p className="mt-1 text-xs text-slate-400">Prioridades para o escritorio.</p>
              <div className="mt-4 grid gap-2.5">
                {tasks.map((task) => (
                  <article className="rounded-xl border border-white/10 bg-slate-950/50 p-3" key={task.title}>
                    <div className="flex items-center justify-between gap-3">
                      <strong className="text-xs">{task.title}</strong>
                      <span className="text-xs font-black text-sky-300">{task.progress}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">{task.detail}</p>
                    <div className="mt-2 h-1.5 rounded-full bg-white/10">
                      <div className="h-1.5 rounded-full bg-sky-300" style={{ width: task.progress }} />
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3 max-[640px]:items-start max-[640px]:flex-col">
              <div>
                <h2 className="text-base font-black">Fila de rotinas</h2>
                <p className="mt-1 text-xs text-slate-400">Acompanhamento das principais tarefas por cliente.</p>
              </div>
              <div className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-bold text-slate-300">
                Junho 2026
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse">
                <thead>
                  <tr className="text-left text-[11px] uppercase text-slate-500">
                    <th className="border-b border-white/10 py-2.5 font-black">Cliente</th>
                    <th className="border-b border-white/10 py-2.5 font-black">Modulo</th>
                    <th className="border-b border-white/10 py-2.5 font-black">Rotina</th>
                    <th className="border-b border-white/10 py-2.5 font-black">Vencimento</th>
                    <th className="border-b border-white/10 py-2.5 font-black">Responsavel</th>
                    <th className="border-b border-white/10 py-2.5 font-black">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {routines.map((item) => (
                    <tr className="text-xs" key={`${item.client}-${item.routine}`}>
                      <td className="border-b border-white/10 py-3 font-bold">{item.client}</td>
                      <td className="border-b border-white/10 py-3 text-slate-300">{item.module}</td>
                      <td className="border-b border-white/10 py-3 text-slate-400">{item.routine}</td>
                      <td className="border-b border-white/10 py-3 text-slate-300">{item.due}</td>
                      <td className="border-b border-white/10 py-3 text-slate-300">{item.owner}</td>
                      <td className="border-b border-white/10 py-3">
                        <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-sky-100">{item.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

        </section>
      </div>
    </main>
  );
}
