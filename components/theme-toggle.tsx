"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

const OPTIONS: { value: Theme; label: string; title?: string; icon: React.ReactNode }[] = [
  {
    value: "light",
    label: "Claro",
    icon: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
  },
  { value: "dark", label: "Escuro", icon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /> },
  { value: "system", label: "Auto", title: "Seguir o sistema", icon: <path d="M3 5h18v11H3zM8 20h8M12 16v4" /> },
];

function readTheme(): Theme {
  try {
    const t = localStorage.getItem("tema");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

function apply(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  if (root.classList.contains("dark") === dark) return;
  // Transição de cores só durante a troca (não pesa no resto da navegação)
  root.classList.add("theme-transition");
  root.classList.toggle("dark", dark);
  window.setTimeout(() => root.classList.remove("theme-transition"), 400);
}

/** Seletor de tema: Claro, Escuro ou seguir o sistema. A escolha fica salva no navegador. */
export function ThemeToggle({ showLabels = false }: { showLabels?: boolean }) {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    setTheme(readTheme());
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => readTheme() === "system" && apply("system");
    // Mantém sincronizados os seletores da mesma página (menu, configurações)
    const onSync = () => setTheme(readTheme());
    mq.addEventListener("change", onChange);
    window.addEventListener("tema-alterado", onSync);
    return () => {
      mq.removeEventListener("change", onChange);
      window.removeEventListener("tema-alterado", onSync);
    };
  }, []);

  function choose(t: Theme) {
    setTheme(t);
    try {
      if (t === "system") localStorage.removeItem("tema");
      else localStorage.setItem("tema", t);
    } catch {
      // armazenamento indisponível: o tema só vale para esta aba
    }
    apply(t);
    window.dispatchEvent(new Event("tema-alterado"));
  }

  return (
    <div role="radiogroup" aria-label="Tema" className="inline-flex w-full gap-0.5 rounded-[10px] border border-border bg-surface-2 p-[3px]">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={theme === o.value}
          title={o.title ?? o.label}
          onClick={() => choose(o.value)}
          className={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-xs font-medium transition ${
            theme === o.value ? "bg-surface text-foreground shadow-[0_1px_2px_rgba(17,22,20,0.08)]" : "text-muted hover:text-foreground"
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="shrink-0" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {o.icon}
          </svg>
          <span className={showLabels ? "truncate" : "sr-only"}>{o.label}</span>
        </button>
      ))}
    </div>
  );
}
