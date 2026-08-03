"use client";

import { supabase } from "@/app/lib/supabaseClient";

/**
 * Chamada de API autenticada a partir do browser.
 *
 * As telas do ERP nao consultam o Supabase direto: o RLS so libera as tabelas
 * para o servidor, entao tudo passa por /api/* levando o token da sessao. Cada
 * tela repetia este mesmo bloco, com pequenas diferencas no tratamento de erro.
 */
export async function requisitarApi<T extends { error?: string }>(
  path: string,
  init: RequestInit = {}
): Promise<{ ok: boolean; result: T }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { ok: false, result: { error: "Sessao nao encontrada. Entre novamente no sistema." } as T };
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  try {
    const response = await fetch(path, { ...init, headers });
    const result = (await response.json().catch(() => ({}))) as T;

    if (!response.ok) {
      return { ok: false, result: { ...result, error: result.error || "Nao foi possivel completar a operacao." } };
    }

    return { ok: true, result };
  } catch {
    return { ok: false, result: { error: "Falha de conexao com o servidor." } as T };
  }
}
