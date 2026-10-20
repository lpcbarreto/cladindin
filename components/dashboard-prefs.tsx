"use client";

import { useEffect, useState } from "react";

const KEY = "painel-oculto";

/** Mostrar/ocultar blocos do início. Fica salvo neste navegador. */
export function DashboardPrefs({ sections }: { sections: { id: string; label: string }[] }) {
  const [hidden, setHidden] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      setHidden(JSON.parse(localStorage.getItem(KEY) ?? "[]"));
    } catch {
      setHidden([]);
    }
  }, []);

  function toggle(id: string) {
    const next = hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id];
    setHidden(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // sem armazenamento: vale só nesta visita
    }
  }

  const css = hidden.map((h) => `[data-section="${h.replace(/[^\w-]/g, "")}"]{display:none!important}`).join("");
  return (
    <div className="relative">
      {css && <style>{css}</style>}
      <button type="button" className="btn-ghost py-1.5 text-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Personalizar
      </button>
      {open && (
        <div className="msg-in absolute right-0 z-30 mt-2 w-64 space-y-2 rounded-2xl border border-border bg-surface p-4 text-sm shadow-xl">
          <p className="font-bold">Mostrar no início</p>
          {sections.map((s) => (
            <label key={s.id} className="flex items-center gap-2">
              <input type="checkbox" checked={!hidden.includes(s.id)} onChange={() => toggle(s.id)} />
              {s.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/** Checklist de primeiros passos; dá para dispensar. */
export function OnboardingDismiss({ children }: { children: React.ReactNode }) {
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem("primeiros-passos") === "ok");
    } catch {
      setDismissed(false);
    }
  }, []);
  if (dismissed) return null;
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Dispensar primeiros passos"
        className="absolute top-4 right-4 z-10 text-muted hover:text-foreground"
        onClick={() => {
          setDismissed(true);
          try {
            localStorage.setItem("primeiros-passos", "ok");
          } catch {
            // ignora
          }
        }}
      >
        ✕
      </button>
      {children}
    </div>
  );
}
