"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabaseClient";

/**
 * Destino do link de recuperação de senha.
 *
 * O link do e-mail passa pelo /auth/v1/verify do Supabase, que valida o token e
 * redireciona para cá com a sessão de recuperação no fragmento da URL. O cliente
 * do Supabase lê esse fragmento sozinho (detectSessionInUrl), então aqui só
 * resta esperar a sessão aparecer e trocar a senha.
 *
 * Sem esta página o link caía na raiz do app, que exige login — quem clicava
 * voltava para a tela de login sem nunca conseguir definir a senha nova.
 */
export default function RedefinirSenhaPage() {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [estado, setEstado] = useState<"verificando" | "pronto" | "sem-sessao" | "concluido">(
    "verificando"
  );

  useEffect(() => {
    let ativo = true;

    // A sessão pode já estar montada quando o componente sobe, ou chegar logo
    // depois — o SDK processa o fragmento de forma assíncrona. Ouvir e conferir
    // cobre os dois casos sem depender da ordem.
    const { data: subscription } = supabase.auth.onAuthStateChange((evento, sessao) => {
      if (!ativo) return;
      if (evento === "PASSWORD_RECOVERY" || sessao) setEstado("pronto");
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return;
      setEstado((atual) => (atual === "pronto" ? atual : data.session ? "pronto" : "sem-sessao"));
    });

    return () => {
      ativo = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function handleSalvar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro("");

    if (senha.length < 8) {
      setErro("A senha precisa ter ao menos 8 caracteres.");
      return;
    }

    if (senha !== confirmar) {
      setErro("A confirmacao nao confere com a senha digitada.");
      return;
    }

    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });

    if (error) {
      setSalvando(false);
      setErro(`Nao foi possivel salvar a senha: ${error.message}`);
      return;
    }

    // A sessão de recuperação não deve virar sessão de trabalho: quem trocou a
    // senha entra de novo com ela.
    await supabase.auth.signOut();
    setSalvando(false);
    setEstado("concluido");
    setTimeout(() => router.push("/login"), 2500);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070b16] text-white">
      <Image
        src="/login-bg.png"
        alt="Ambiente de ERP contabil"
        fill
        priority
        className="object-cover"
      />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(90deg,rgba(3,9,24,0.96)_0%,rgba(3,9,24,0.75)_42%,rgba(3,9,24,0.30)_100%)]" />

      <section className="relative grid min-h-screen place-items-center px-5 py-8">
        <div className="w-full max-w-md rounded-3xl border border-white/15 bg-[#061020]/82 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
          <Image
            src="/logo-riseup-branca.png"
            alt="Tatiane Fontes Assessoria Contabil"
            width={200}
            height={200}
            className="mx-auto h-auto w-40 max-w-full object-contain"
          />

          <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.2em] text-violet-300">
            Recuperacao de acesso
          </p>
          <h1 className="mt-2 text-2xl font-black">Definir nova senha</h1>

          {estado === "verificando" && (
            <p className="mt-4 text-xs leading-5 text-slate-400">Validando o link do e-mail...</p>
          )}

          {estado === "sem-sessao" && (
            <div className="mt-4 grid gap-4">
              <p className="rounded-lg border border-rose-300/25 bg-rose-300/10 px-3 py-2 text-xs leading-5 text-rose-100">
                Este link de recuperacao expirou ou ja foi usado. Peca um novo na tela de login.
              </p>
              <button
                className="flex min-h-11 items-center justify-center rounded-lg bg-sky-300 px-4 text-sm font-black text-slate-950 transition hover:bg-sky-200"
                onClick={() => router.push("/login")}
                type="button"
              >
                Voltar ao login
              </button>
            </div>
          )}

          {estado === "concluido" && (
            <p className="mt-4 rounded-lg border border-sky-300/25 bg-sky-300/10 px-3 py-2 text-xs leading-5 text-sky-100">
              Senha alterada. Redirecionando para o login...
            </p>
          )}

          {estado === "pronto" && (
            <form className="mt-5 grid gap-4" onSubmit={handleSalvar}>
              <label className="grid gap-2 text-xs font-bold text-slate-300">
                Nova senha
                <input
                  className="min-h-11 rounded-lg border border-white/10 bg-slate-950/65 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-violet-300/60 focus:ring-2 focus:ring-violet-300/15"
                  onChange={(event) => setSenha(event.target.value)}
                  placeholder="Minimo de 8 caracteres"
                  type="password"
                  value={senha}
                />
              </label>

              <label className="grid gap-2 text-xs font-bold text-slate-300">
                Confirmar a nova senha
                <input
                  className="min-h-11 rounded-lg border border-white/10 bg-slate-950/65 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-violet-300/60 focus:ring-2 focus:ring-violet-300/15"
                  onChange={(event) => setConfirmar(event.target.value)}
                  placeholder="Digite de novo"
                  type="password"
                  value={confirmar}
                />
              </label>

              {erro && (
                <p className="rounded-lg border border-rose-300/25 bg-rose-300/10 px-3 py-2 text-xs text-rose-100">
                  {erro}
                </p>
              )}

              <button
                className="flex min-h-11 items-center justify-center rounded-lg bg-sky-300 px-4 text-sm font-black text-slate-950 shadow-[0_18px_42px_rgba(56,189,248,0.22)] transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={salvando}
                type="submit"
              >
                {salvando ? "Salvando..." : "Salvar nova senha"}
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
