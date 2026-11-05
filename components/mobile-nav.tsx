"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NavIcon } from "@/components/app-nav";

/** Abre a janela de lançamento rápido / busca (escutada pela CommandBar). */
export function openCommand(mode: "add" | "search") {
  window.dispatchEvent(new CustomEvent("cladindin:comando", { detail: mode }));
}

/** Barra inferior no celular: Início, Lançamentos, +, Planejar e Mais (abre o menu completo). */
export function MobileNav({ base, children }: { base: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const tab = (href: string, label: string, icon: string) => {
    const full = `${base}/${href}`;
    const active = pathname === full || pathname.startsWith(`${full}/`);
    return (
      <Link href={full} aria-current={active ? "page" : undefined} className={`flex flex-col items-center gap-1 py-1 text-[11px] ${active ? "font-semibold text-primary" : "text-muted"}`}>
        <NavIcon name={icon} />
        {label}
      </Link>
    );
  };

  return (
    <>
      <nav aria-label="Navegação rápida" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 items-center border-t border-border bg-surface/95 px-2 pt-1.5 pb-[max(10px,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        {tab("dashboard", "Início", "dashboard")}
        {tab("lancamentos", "Lançamentos", "lancamentos")}
        <button
          type="button"
          onClick={() => openCommand("add")}
          aria-label="Novo lançamento"
          className="-mt-6 grid h-13 w-13 place-items-center justify-self-center rounded-2xl bg-primary text-primary-fg shadow-[0_10px_22px_-10px_rgba(11,127,87,0.7)] active:scale-95"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        {tab("planejamento", "Planejar", "planejamento")}
        <button type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="menu-celular" className="flex flex-col items-center gap-1 py-1 text-[11px] text-muted">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          Mais
        </button>
      </nav>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div id="menu-celular" className="msg-in absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-[20px] border-t border-border bg-surface p-5 pb-[max(20px,env(safe-area-inset-bottom))]">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" aria-hidden="true" />
            {children}
          </div>
        </div>
      )}
    </>
  );
}
