"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { currentUserStorageKey } from "@/app/components/TopbarUser";
import { supabase } from "@/app/lib/supabaseClient";

const accessHighlights = [
  "Rotinas recorrentes e checklists por cliente",
  "SLA, prazos fiscais e produtividade da equipe",
  "Pendencias, documentos e agenda operacional",
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [lembrar, setLembrar] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");

    if (!email.trim() || !senha.trim()) {
      setFeedback("Informe e-mail e senha.");
      return;
    }

    setIsLoading(true);
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: senha.trim(),
    });

    if (authError) {
      setIsLoading(false);
      setFeedback("E-mail ou senha invalidos no Supabase Auth.");
      return;
    }

    const response = await fetch("/api/auth/current-user", {
      headers: {
        Authorization: `Bearer ${authData.session.access_token}`,
      },
    });
    const result = await response.json().catch(() => ({} as {
      error?: string;
      usuario?: {
        id: string;
        nome: string;
        email: string | null;
        perfil: string;
        status: string | null;
      };
    }));
    setIsLoading(false);

    if (!response.ok || !result.usuario) {
      await supabase.auth.signOut();
      setFeedback(result.error || "Não foi possível validar o usuário cadastrado.");
      return;
    }

    window.localStorage.setItem(currentUserStorageKey, JSON.stringify({
      id: result.usuario.id,
      nome: result.usuario.nome,
      email: result.usuario.email,
      perfil: result.usuario.perfil,
      lembrar,
    }));

    // Seta um cookie com o token de autenticação para proteção no middleware
    document.cookie = `auth-token=${authData.session.access_token}; path=/; max-age=${lembrar ? 30 * 24 * 60 * 60 : 24 * 60 * 60}; samesite=lax`;

    window.dispatchEvent(new Event("tf-erp-user-changed"));
    router.push("/");
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070b16] text-white">
      <Image
        src="/login-bg.png"
        alt="Ambiente de ERP contábil com dashboards e documentos"
        fill
        priority
        className="object-cover"
      />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(90deg,rgba(3,9,24,0.96)_0%,rgba(3,9,24,0.75)_42%,rgba(3,9,24,0.30)_100%)]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_16%_14%,rgba(34,211,238,0.24),transparent_30%),radial-gradient(circle_at_84%_10%,rgba(167,139,250,0.28),transparent_32%)]" />

      <section className="relative grid min-h-screen grid-cols-[minmax(0,1fr)_440px] gap-8 px-10 py-8 max-[980px]:grid-cols-1 max-[680px]:px-5">
        <div className="flex min-h-[calc(100vh-64px)] flex-col justify-between">
          <div className="flex justify-center">
            <Image
              src="/logo-riseup-branca.png"
              alt="Tatiane Fontes Assessoria Contabil"
              width={320}
              height={320}
              priority
              className="h-auto w-72 max-w-full object-contain"
            />
          </div>

          <div className="max-w-2xl py-10">
            <h1 className="text-3xl font-black leading-tight tracking-normal max-[980px]:text-2xl max-[680px]:text-xl">
              A operação do escritório em uma tela.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300">
              Entre para acompanhar tarefas recorrentes, prazos fiscais, documentos, produtividade da equipe e pendências dos clientes.
            </p>

            <div className="mt-6 grid gap-3">
              {accessHighlights.map((item) => (
                <div className="flex items-center gap-3 text-sm text-slate-300" key={item}>
                  <span className="grid size-7 place-items-center rounded-full border border-sky-300/30 bg-sky-300/10 text-sky-200 shadow-[0_0_18px_rgba(56,189,248,0.18)]">
                    <svg className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-slate-500">2026 RiseUp. Ambiente interno do escritorio.</p>
        </div>

        <div className="flex min-h-[calc(100vh-64px)] items-center justify-center">
          <section className="w-full rounded-3xl border border-white/15 bg-[#061020]/82 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-300">Login</p>
              <h2 className="mt-2 text-2xl font-black">Entrar no sistema</h2>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                Informe suas credenciais para acessar o ERP.
              </p>
            </div>

            <form className="mt-6 grid gap-4" onSubmit={handleLogin}>
              <label className="grid gap-2 text-xs font-bold text-slate-300">
                E-mail
                <input
                  className="min-h-11 rounded-lg border border-white/10 bg-slate-950/65 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-sky-300/60 focus:ring-2 focus:ring-sky-300/15"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="usuario@escritorio.com.br"
                  type="email"
                  value={email}
                />
              </label>

              <label className="grid gap-2 text-xs font-bold text-slate-300">
                Senha
                <input
                  className="min-h-11 rounded-lg border border-white/10 bg-slate-950/65 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-violet-300/60 focus:ring-2 focus:ring-violet-300/15"
                  onChange={(event) => setSenha(event.target.value)}
                  placeholder="Digite sua senha"
                  type="password"
                  value={senha}
                />
              </label>

              <div className="flex items-center justify-between gap-3 text-xs">
                <label className="flex items-center gap-2 text-slate-400">
                  <input className="size-4 accent-sky-300" checked={lembrar} onChange={(event) => setLembrar(event.target.checked)} type="checkbox" />
                  Lembrar acesso
                </label>
                <button className="font-bold text-sky-300" type="button">
                  Esqueci minha senha
                </button>
              </div>

              {feedback && <p className="rounded-lg border border-rose-300/25 bg-rose-300/10 px-3 py-2 text-xs text-rose-100">{feedback}</p>}

              <button
                className="flex min-h-11 items-center justify-center rounded-lg bg-sky-300 px-4 text-sm font-black text-slate-950 shadow-[0_18px_42px_rgba(56,189,248,0.22)] transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isLoading}
                type="submit"
              >
                {isLoading ? "Entrando..." : "Entrar no ERP"}
              </button>
            </form>

            <div className="mt-5 rounded-xl border border-white/10 bg-slate-950/55 p-3">
              <p className="text-[11px] font-bold uppercase text-sky-300">Acesso seguro</p>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                Pronto para conectar autenticação real com usuários, permissões por departamento e controle de sessões.
              </p>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
