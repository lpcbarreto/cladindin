"use client";

import { useEffect, useState } from "react";

const KEY = "menu-recolhido";

/**
 * Menu lateral (computador) que pode ser recolhido para só os ícones.
 * A escolha fica salva neste navegador. Os filhos se adaptam pelo atributo data-collapsed.
 */
export function SidebarShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(KEY) === "1");
    } catch {
      setCollapsed(false);
    }
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      // sem armazenamento: vale só nesta visita
    }
  }

  return (
    <aside
      data-collapsed={collapsed}
      aria-label="Menu lateral"
      className={`group/side sticky top-0 hidden h-dvh flex-col gap-4 border-r border-border bg-surface py-5 transition-[width] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] md:flex ${
        collapsed ? "w-[72px] overflow-visible px-2.5" : "w-[248px] overflow-y-auto overscroll-contain px-3"
      }`}
    >
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        aria-expanded={!collapsed}
        title={collapsed ? "Expandir menu" : "Recolher menu"}
        className={`absolute top-6 z-10 grid h-7 w-7 place-items-center rounded-lg border border-border bg-surface text-muted transition-colors hover:border-border-strong hover:text-foreground ${
          collapsed ? "left-1/2 -translate-x-1/2 top-[60px]" : "right-3"
        }`}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="3" />
          <path d={collapsed ? "M9 4v16M13 10l2 2-2 2" : "M9 4v16M15 10l-2 2 2 2"} />
        </svg>
      </button>
      {children}
    </aside>
  );
}
