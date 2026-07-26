"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabaseClient";

type LoggedUser = {
  id: string;
  nome: string;
  email: string | null;
  perfil: string;
};

const currentUserStorageKey = "tf-erp-current-user";

function getStoredUser() {
  if (typeof window === "undefined") return null;

  try {
    const stored = window.localStorage.getItem(currentUserStorageKey);
    return stored ? JSON.parse(stored) as LoggedUser : null;
  } catch {
    return null;
  }
}

export function LoggedUserPanel() {
  const [user, setUser] = useState<LoggedUser | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setUser(getStoredUser());
    setIsHydrated(true);

    function syncUser() {
      setUser(getStoredUser());
    }

    window.addEventListener("storage", syncUser);
    window.addEventListener("tf-erp-user-changed", syncUser);

    return () => {
      window.removeEventListener("storage", syncUser);
      window.removeEventListener("tf-erp-user-changed", syncUser);
    };
  }, []);

  if (!isHydrated) return null;

  return (
    <section className="mt-3 rounded-xl border border-white/10 bg-slate-950/60 p-3">
          <p className="text-[11px] font-semibold uppercase text-slate-500">Usuário logado</p>
      <div className="mt-2 flex min-w-0 items-center gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-full border border-sky-300/25 bg-sky-300/10 text-xs font-black text-sky-200">
          {(user?.nome || "?").slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <strong className="block truncate text-xs font-bold text-slate-100">{user?.nome || "Não identificado"}</strong>
          <span className="block truncate text-[11px] text-slate-500">{user?.perfil || "Sem perfil"}</span>
        </div>
      </div>
    </section>
  );
}

export function LogoffLink() {
  async function handleLogoff() {
    window.localStorage.removeItem(currentUserStorageKey);
    // Remove o cookie de autenticação
    document.cookie = 'auth-token=; path=/; max-age=0';
    window.dispatchEvent(new Event("tf-erp-user-changed"));
    await supabase.auth.signOut();
  }

  return (
    <Link
      className="flex min-h-8 items-center gap-1.5 rounded-lg border border-white/10 px-2 text-[11px] font-bold text-slate-300 transition hover:border-rose-300/35 hover:bg-rose-300/10 hover:text-rose-100"
      href="/login"
      onClick={handleLogoff}
    >
      <svg
        className="size-4 text-rose-300 drop-shadow-[0_0_8px_rgba(251,113,133,0.55)]"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="M16 17l5-5-5-5" />
        <path d="M21 12H9" />
      </svg>
      <span>Logoff</span>
    </Link>
  );
}

export { currentUserStorageKey };
