"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginAltPage() {
  const router = useRouter();
  const [email, setEmail] = useState("klaus.magnum@tatianefontes.com");
  const [senha, setSenha] = useState("Rise0147,");
  const [feedback, setFeedback] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !senha.trim()) {
      setFeedback("Informe e-mail e senha.");
      return;
    }

    setFeedback("Autenticando...");
    setIsLoading(true);

    try {
      // 1. Fazer login no Supabase Auth
      const authResponse = await fetch("https://icbbqfgdlmcqvjixziar.supabase.co/auth/v1/token?grant_type=password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: "sb_publishable_EElQK8GXA83sHKK-bECTaQ_PEBPzPqn",
        },
        body: JSON.stringify({
          email: email.trim(),
          password: senha,
        }),
      });

      const authData = await authResponse.json();

      if (!authData.access_token) {
        setIsLoading(false);
        setFeedback("❌ E-mail ou senha inválidos.");
        return;
      }

      // 2. Validar usuário no banco local
      const userResponse = await fetch("/api/auth/current-user", {
        headers: {
          Authorization: `Bearer ${authData.access_token}`,
        },
      });

      const userData = await userResponse.json();

      if (!userData.usuario) {
        setIsLoading(false);
        setFeedback("❌ " + (userData.error || "Usuário não encontrado"));
        return;
      }

      // 3. Settar cookie de autenticação
      document.cookie = `auth-token=${authData.access_token}; path=/; max-age=${30 * 24 * 60 * 60}; samesite=lax`;

      // 4. Salvar dados do usuário no localStorage
      window.localStorage.setItem(
        "tf-erp-current-user",
        JSON.stringify({
          id: userData.usuario.id,
          nome: userData.usuario.nome,
          email: userData.usuario.email,
          perfil: userData.usuario.perfil,
        })
      );

      window.dispatchEvent(new Event("tf-erp-user-changed"));

      setFeedback("✅ Login realizado com sucesso! Redirecionando...");
      setTimeout(() => {
        router.push("/");
      }, 1000);
    } catch (error) {
      setIsLoading(false);
      setFeedback("❌ Erro ao fazer login: " + (error instanceof Error ? error.message : "Desconhecido"));
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-slate-800 rounded-lg shadow-2xl p-8 border border-slate-700">
          <h1 className="text-2xl font-bold text-white mb-2">RiseUP</h1>
          <p className="text-slate-400 mb-6">Login Alternativo</p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                placeholder="seu@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Senha</label>
              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                placeholder="••••••••"
              />
            </div>

            {feedback && (
              <div className={`p-3 rounded-lg text-sm ${
                feedback.includes("✅")
                  ? "bg-green-900/30 text-green-300 border border-green-700"
                  : feedback.includes("Autenticando")
                  ? "bg-blue-900/30 text-blue-300 border border-blue-700"
                  : "bg-red-900/30 text-red-300 border border-red-700"
              }`}>
                {feedback}
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={isLoading}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white font-semibold rounded-lg transition"
            >
              {isLoading ? "Entrando..." : "Entrar no ERP"}
            </button>
          </div>

          <div className="mt-6 p-4 bg-slate-700/50 rounded-lg border border-slate-600">
            <p className="text-xs text-slate-400">
              <strong>Nota:</strong> Esta é a página de login alternativa para fins de teste e desenvolvimento.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
