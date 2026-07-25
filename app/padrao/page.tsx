import Image from "next/image";
import Link from "next/link";
import ErpSidebar from "@/app/components/ErpSidebar";
import { LogoffLink } from "@/app/components/TopbarUser";

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

export default function Padrao() {
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
        </section>
      </div>
    </main>
  );
}
