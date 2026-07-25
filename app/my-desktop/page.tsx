"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import ErpSidebar from "@/app/components/ErpSidebar";
import { LogoffLink, currentUserStorageKey } from "@/app/components/TopbarUser";

const cadastroItems = [
  "Obrigações",
  "Tarefas",
  "Clientes",
  "Grupo de clientes",
  "Setores",
  "Usuários",
];

const configuracaoItems = [
  { label: "Dashboard", href: "/" },
  { label: "Dados da empresa", href: "/configuracoes/dados-empresa" },
];

const vinculoItems = [
  { label: "Clientes", href: "/cadastros/clientes" },
  { label: "Grupo de clientes", href: "/cadastros/grupo-clientes" },
];

const relatorioItems = [
  { label: "Obrigações finalizadas", href: "/relatorios/obrigacoes-finalizadas" },
];

export default function MyDesktop() {
  const [userName, setUserName] = useState("");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(currentUserStorageKey);
      if (stored) {
        const user = JSON.parse(stored);
        const firstName = user.nome ? user.nome.split(" ")[0] : "Usuário";
        setUserName(firstName);
      }
    } catch {
      setUserName("Usuário");
    }
  }, []);

  return (
    <main className="min-h-screen overflow-hidden bg-[#070b16] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(34,211,238,0.26),transparent_30%),radial-gradient(circle_at_84%_8%,rgba(167,139,250,0.28),transparent_32%),radial-gradient(circle_at_62%_78%,rgba(56,189,248,0.14),transparent_34%),linear-gradient(135deg,#061020_0%,#080b18_48%,#12091f_100%)]" />
      <div className="relative grid min-h-screen grid-cols-[236px_minmax(0,1fr)] max-[980px]:grid-cols-1">
        <ErpSidebar />

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
                  <span>Relatórios</span>
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
                  <span>Vínculos</span>
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

          {/* SAUDAÇÃO E RESUMO DO DIA */}
          <div className="mb-6 rounded-2xl border border-white/10 bg-slate-950/60 px-6 py-5 backdrop-blur-xl">
            <h1 className="text-2xl font-black">Olá, {userName}! 👋</h1>
            <p className="mt-3 text-sm text-slate-300">Hoje você tem:</p>
            <ul className="mt-4 space-y-2">
              <li className="flex items-center gap-2 text-sm">
                <span className="text-sky-300">•</span>
                <span><strong>8 tarefas</strong> para concluir</span>
              </li>
              <li className="flex items-center gap-2 text-sm">
                <span className="text-rose-300">•</span>
                <span><strong>2 tarefas atrasadas</strong></span>
              </li>
              <li className="flex items-center gap-2 text-sm">
                <span className="text-amber-300">•</span>
                <span><strong>4 obrigações fiscais</strong> vencendo</span>
              </li>
              <li className="flex items-center gap-2 text-sm">
                <span className="text-violet-300">•</span>
                <span><strong>3 checklists pendentes</strong></span>
              </li>
              <li className="flex items-center gap-2 text-sm">
                <span className="text-blue-300">•</span>
                <span><strong>1 tarefa devolvida</strong> para correção</span>
              </li>
            </ul>
          </div>

          {/* BLOCOS PRINCIPAIS */}
          <div className="grid grid-cols-2 gap-5 max-[1024px]:grid-cols-1">
            {/* Minhas tarefas de hoje */}
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-6 py-5 backdrop-blur-xl">
              <h2 className="text-lg font-black text-sky-300">Minhas tarefas de hoje</h2>
              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-white/5 bg-slate-950/40 p-3">
                  <p className="font-medium text-slate-100">Transmissão DCTFWeb - Alfa Comércio</p>
                  <p className="mt-1 text-xs text-slate-400">Vence às 17h • Fiscal</p>
                </div>
                <div className="rounded-lg border border-white/5 bg-slate-950/40 p-3">
                  <p className="font-medium text-slate-100">Fechamento contábil - Studio Pixel</p>
                  <p className="mt-1 text-xs text-slate-400">Vence às 18h • Contábil</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-slate-500">+6 tarefas</p>
                </div>
              </div>
            </div>

            {/* Tarefas atrasadas */}
            <div className="rounded-2xl border border-rose-300/20 bg-slate-950/60 px-6 py-5 backdrop-blur-xl">
              <h2 className="text-lg font-black text-rose-300">Tarefas atrasadas</h2>
              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-rose-300/20 bg-rose-950/30 p-3">
                  <p className="font-medium text-slate-100">Conciliação bancária - Clínica Horizonte</p>
                  <p className="mt-1 text-xs text-rose-300">Atrasado em 3 dias</p>
                </div>
                <div className="rounded-lg border border-rose-300/20 bg-rose-950/30 p-3">
                  <p className="font-medium text-slate-100">Validação de recibos - NovaRota</p>
                  <p className="mt-1 text-xs text-rose-300">Atrasado em 1 dia</p>
                </div>
              </div>
            </div>

            {/* Próximas obrigações */}
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-6 py-5 backdrop-blur-xl">
              <h2 className="text-lg font-black text-amber-300">Próximas obrigações</h2>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-white/5 bg-slate-950/40 p-3">
                  <div>
                    <p className="font-medium text-slate-100">DCTFWeb</p>
                    <p className="text-xs text-slate-400">Fiscal • 4 clientes</p>
                  </div>
                  <span className="text-sm font-black text-amber-300">Hoje</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-white/5 bg-slate-950/40 p-3">
                  <div>
                    <p className="font-medium text-slate-100">Guia de Impostos</p>
                    <p className="text-xs text-slate-400">Fiscal • 3 clientes</p>
                  </div>
                  <span className="text-sm font-black text-amber-300">2 dias</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-white/5 bg-slate-950/40 p-3">
                  <div>
                    <p className="font-medium text-slate-100">Folha de Pagamento</p>
                    <p className="text-xs text-slate-400">RH • 5 clientes</p>
                  </div>
                  <span className="text-sm font-black text-amber-300">4 dias</span>
                </div>
              </div>
            </div>

            {/* Clientes sob minha responsabilidade */}
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-6 py-5 backdrop-blur-xl">
              <h2 className="text-lg font-black text-blue-300">Clientes sob minha responsabilidade</h2>
              <div className="mt-4 space-y-2">
                <div className="text-sm text-slate-300">
                  <p className="font-medium">Alfa Comércio Ltda</p>
                  <p className="text-xs text-slate-500">Fiscal • 2 tarefas pendentes</p>
                </div>
                <div className="text-sm text-slate-300">
                  <p className="font-medium">Studio Pixel ME</p>
                  <p className="text-xs text-slate-500">Contábil • Tudo em dia</p>
                </div>
                <div className="text-sm text-slate-300">
                  <p className="font-medium">Clínica Horizonte</p>
                  <p className="text-xs text-slate-500">RH • 1 pendência</p>
                </div>
              </div>
            </div>

            {/* Pendências aguardando minha ação */}
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-6 py-5 backdrop-blur-xl">
              <h2 className="text-lg font-black text-violet-300">Pendências aguardando minha ação</h2>
              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-white/5 bg-slate-950/40 p-3">
                  <p className="font-medium text-slate-100">Aprovação de folha</p>
                  <p className="text-xs text-slate-400">Aguarda desde ontem</p>
                </div>
                <div className="rounded-lg border border-white/5 bg-slate-950/40 p-3">
                  <p className="font-medium text-slate-100">Revisão de DAS</p>
                  <p className="text-xs text-slate-400">Aguarda há 2 dias</p>
                </div>
              </div>
            </div>

            {/* Checklists em aberto */}
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-6 py-5 backdrop-blur-xl">
              <h2 className="text-lg font-black text-slate-100">Checklists em aberto</h2>
              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-white/5 bg-slate-950/40 p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-slate-100">Fechamento mensal fiscal</p>
                    <span className="text-xs font-bold text-sky-300">75%</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-white/10">
                    <div className="h-1.5 w-3/4 rounded-full bg-sky-300" />
                  </div>
                </div>
                <div className="rounded-lg border border-white/5 bg-slate-950/40 p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-slate-100">Validação de documentos</p>
                    <span className="text-xs font-bold text-sky-300">50%</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-white/10">
                    <div className="h-1.5 w-1/2 rounded-full bg-sky-300" />
                  </div>
                </div>
                <div className="rounded-lg border border-white/5 bg-slate-950/40 p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-slate-100">Checklist RH mensal</p>
                    <span className="text-xs font-bold text-sky-300">25%</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-white/10">
                    <div className="h-1.5 w-1/4 rounded-full bg-sky-300" />
                  </div>
                </div>
              </div>
            </div>

            {/* Avisos internos */}
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-6 py-5 backdrop-blur-xl">
              <h2 className="text-lg font-black text-slate-100">Avisos internos</h2>
              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-blue-300/20 bg-blue-950/30 p-3">
                  <p className="text-xs font-bold uppercase text-blue-300">Gestão</p>
                  <p className="mt-1 text-sm text-slate-200">Reunião de alinhamento amanhã às 14h na sala de conferência</p>
                </div>
                <div className="rounded-lg border border-sky-300/20 bg-sky-950/30 p-3">
                  <p className="text-xs font-bold uppercase text-sky-300">Setor Fiscal</p>
                  <p className="mt-1 text-sm text-slate-200">Atualizações na rotina de DCTFWeb. Ver base de procedimentos.</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
