"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LoggedUserPanel } from "./TopbarUser";

const modules = [
  { label: "Dashboard", href: "/", icon: "dashboard", disabled: false },
  { label: "My Desktop", href: "/my-desktop", icon: "desktop", disabled: false },
  { label: "Base de Procedimentos", href: "/base-procedimentos", icon: "procedures", disabled: false },
  { label: "Documentos Fiscais", href: "/documentos-fiscais/painel", icon: "tax", disabled: false },
  { label: "Gest\u00e3o de Tarefas", href: "#", icon: "tasks", disabled: true },
  { label: "Cont\u00e1bil", href: "#", icon: "accounting", disabled: true },
  { label: "Fiscal/Tribut\u00e1rio", href: "#", icon: "tax", disabled: true },
  { label: "Trabalhista/Pessoal", href: "#", icon: "people", disabled: true },
  { label: "Agenda Fiscal", href: "#", icon: "calendar", disabled: true },
  { label: "Financeiro", href: "#", icon: "finance", disabled: true },
  { label: "Padr\u00e3o", href: "/padrao", icon: "default", disabled: false },
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

  if (icon === "desktop") {
    return (
      <svg {...commonProps}>
        <path d="M2 3h20v14H2z" />
        <path d="M6 17h12" />
        <path d="M9 17v2" />
        <path d="M15 17v2" />
      </svg>
    );
  }

  if (icon === "default") {
    return (
      <svg {...commonProps}>
        <path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9" />
        <path d="M9 3v4h4V3" />
        <path d="M9 11h6" />
        <path d="M9 15h6" />
      </svg>
    );
  }

  if (icon === "procedures") {
    return (
      <svg {...commonProps}>
        <path d="M4 19.5V4.5A2.5 2.5 0 0 1 6.5 2H18v20H6.5A2.5 2.5 0 0 1 4 19.5Z" />
        <path d="M9 7h6" />
        <path d="M9 11h6" />
        <path d="M9 15h3" />
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

export default function ErpSidebar() {
  const pathname = usePathname();

  return (
    <aside className="border-r border-white/10 bg-[#061020] px-4 py-5 max-[980px]:border-b max-[980px]:border-r-0">
      <Link
        aria-label="Voltar ao Dashboard"
        className="flex justify-center transition hover:scale-[1.02]"
        href="/"
      >
        <Image
          src="/logo-riseup-branca.png"
          alt="Tatiane Fontes Assessoria Contabil"
          width={220}
          height={220}
          priority
          className="h-auto w-52 max-w-full object-contain"
        />
      </Link>

      <nav className="mt-5 grid gap-3 max-[980px]:grid-cols-3 max-[640px]:grid-cols-2" suppressHydrationWarning>
        {modules.map((item) => {
          const isActive = item.href === pathname;
          const isDisabled = item.disabled;
          const itemClassName = `flex items-center gap-2 transition ${
            isDisabled
              ? "text-slate-600 cursor-not-allowed"
              : isActive
              ? "text-sky-100 font-semibold"
              : "text-slate-300 hover:text-sky-100"
          }`;

          return (
            <Link
              key={item.label}
              className={itemClassName}
              href={isDisabled ? "#" : item.href}
              onClick={(e) => isDisabled && e.preventDefault()}
            >
              <span className="flex min-w-0 items-center gap-2">
                <ModuleIcon icon={item.icon} />
                <span className="truncate">{item.label}</span>
              </span>
            </Link>
          );
        })}
      </nav>

      <section className="mt-6 rounded-xl border border-white/10 bg-slate-950/60 p-3">
        <p className="text-[11px] font-semibold uppercase text-slate-500">Saude operacional</p>
        <p className="mt-2 text-xl font-black">87%</p>
        <div className="mt-3 h-1.5 rounded-full bg-white/10">
          <div className="h-1.5 w-[87%] rounded-full bg-sky-300" />
        </div>
        <p className="mt-3 text-[11px] leading-5 text-slate-400">
              Financeiro, contábil, fiscal, pessoal e agenda fiscal em uma fila única.
        </p>
      </section>

      <LoggedUserPanel />
    </aside>
  );
}
