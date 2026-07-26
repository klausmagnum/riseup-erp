"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");

    if (!email.trim() || !nome.trim() || !senha.trim()) {
      setFeedback("Todos os campos são obrigatórios.");
      return;
    }

    if (senha.trim().length < 6) {
      setFeedback("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setIsLoading(true);

    const response = await fetch("/api/setup/first-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), nome: nome.trim(), senha: senha.trim() }),
    });

    const result = await response.json();
    setIsLoading(false);

    if (!response.ok) {
      setFeedback(result.error || "Erro ao criar usuário.");
      return;
    }

    setFeedback("✅ Usuário administrativo criado com sucesso!");
    setTimeout(() => {
      router.push("/login");
    }, 2000);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070b16] text-white flex items-center justify-center">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(34,211,238,0.26),transparent_30%),radial-gradient(circle_at_84%_8%,rgba(167,139,250,0.28),transparent_32%)]" />

      <div className="relative w-full max-w-md mx-auto px-6">
        <div className="rounded-3xl border border-white/15 bg-[#061020]/82 p-8 shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-300">Setup Inicial</p>
            <h2 className="mt-2 text-2xl font-black">Criar Usuário Administrativo</h2>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Este é o primeiro acesso. Crie um usuário com privilégios de administrador.
            </p>
          </div>

          <form className="mt-6 grid gap-4" onSubmit={handleSetup}>
            <label className="grid gap-2 text-xs font-bold text-slate-300">
              Nome Completo
              <input
                className="min-h-11 rounded-lg border border-white/10 bg-slate-950/65 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-sky-300/60 focus:ring-2 focus:ring-sky-300/15"
                onChange={(event) => setNome(event.target.value)}
                placeholder="Seu nome"
                type="text"
                value={nome}
              />
            </label>

            <label className="grid gap-2 text-xs font-bold text-slate-300">
              E-mail
              <input
                className="min-h-11 rounded-lg border border-white/10 bg-slate-950/65 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-sky-300/60 focus:ring-2 focus:ring-sky-300/15"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="seu.email@empresa.com.br"
                type="email"
                value={email}
              />
            </label>

            <label className="grid gap-2 text-xs font-bold text-slate-300">
              Senha
              <input
                className="min-h-11 rounded-lg border border-white/10 bg-slate-950/65 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-violet-300/60 focus:ring-2 focus:ring-violet-300/15"
                onChange={(event) => setSenha(event.target.value)}
                placeholder="Mínimo 6 caracteres"
                type="password"
                value={senha}
              />
            </label>

            {feedback && (
              <p
                className={`rounded-lg border px-3 py-2 text-xs ${
                  feedback.includes("✅")
                    ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
                    : "border-rose-300/25 bg-rose-300/10 text-rose-100"
                }`}
              >
                {feedback}
              </p>
            )}

            <button
              className="flex min-h-11 items-center justify-center rounded-lg bg-sky-300 px-4 text-sm font-black text-slate-950 shadow-[0_18px_42px_rgba(56,189,248,0.22)] transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoading}
              type="submit"
            >
              {isLoading ? "Criando..." : "Criar Usuário Admin"}
            </button>
          </form>

          <div className="mt-5 rounded-xl border border-white/10 bg-slate-950/55 p-3">
            <p className="text-[11px] font-bold uppercase text-sky-300">Atenção</p>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              Este usuário terá privilégios de administrador e poderá criar outros usuários no sistema. Use uma senha segura.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
