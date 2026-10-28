"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  quickAdd,
  searchAll,
  type SearchHit,
} from "@/app/(app)/w/[workspaceId]/global-actions";
import { NavIcon } from "@/components/app-nav";

type Mode = "closed" | "search" | "add";

const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Busca global (Ctrl+K) e lançamento rápido (tecla N ou botão +). */
export function CommandBar({
  workspaceId,
  nav,
}: {
  workspaceId: string;
  nav: { href: string; label: string }[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("closed");
  const [text, setText] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [msg, setMsg] = useState<{
    ok: boolean;
    text: string;
    id: number;
  } | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const base = `/w/${workspaceId}`;

  // Acessibilidade: ao fechar, o foco volta para onde estava (botão, campo…)
  const returnFocus = useRef<HTMLElement | null>(null);

  function open(m: Mode) {
    if (document.activeElement instanceof HTMLElement && !document.activeElement.closest("[role=dialog]")) {
      returnFocus.current = document.activeElement;
    }
    setMode(m);
    setText("");
    setHits([]);
    setMsg(null);
    setActive(0);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      const typing =
        el.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open("search");
      } else if (
        !typing &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        e.key.toLowerCase() === "n"
      ) {
        e.preventDefault();
        open("add");
      } else if (e.key === "Escape") setMode("closed");
    }
    window.addEventListener("keydown", onKey);
    // Atalho "Novo lançamento" do app instalado (?novo=1)
    const url = new URL(window.location.href);
    if (url.searchParams.has("novo")) {
      url.searchParams.delete("novo");
      window.history.replaceState(null, "", url);
      open("add");
    }
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (mode !== "closed") requestAnimationFrame(() => inputRef.current?.focus());
    else if (returnFocus.current?.isConnected) {
      returnFocus.current.focus();
      returnFocus.current = null;
    }
  }, [mode]);

  // Busca com pequeno atraso para não consultar a cada tecla
  useEffect(() => {
    if (mode !== "search") return;
    const t = text.trim();
    if (t.length < 2) {
      setHits([]);
      return;
    }
    const timer = setTimeout(() => {
      searchAll(workspaceId, t)
        .then(setHits)
        .catch(() => setHits([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [text, mode, workspaceId]);

  const pages =
    mode === "search"
      ? nav.filter(
          (n) => !text.trim() || fold(n.label).includes(fold(text.trim())),
        )
      : [];
  const items = [
    ...pages.map((p) => ({
      key: p.href,
      href: `${base}/${p.href}`,
      title: p.label,
      subtitle: "Página",
      icon: p.href,
    })),
    ...hits.map((h) => ({
      key: h.kind + h.id,
      href: h.href,
      title: h.title,
      subtitle: h.subtitle,
      icon:
        h.kind === "lancamento"
          ? "lancamentos"
          : h.kind === "contato"
            ? "contatos"
            : "categorias",
    })),
  ];

  function go(href: string) {
    setMode("closed");
    router.push(href);
  }

  function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await quickAdd(workspaceId, text);
      setMsg({ ok: r.ok, text: r.message, id: Date.now() });
      if (r.ok) {
        setText("");
        router.refresh();
      }
    });
  }

  return (
    <>
      {mounted &&
        createPortal(
          <button
            type="button"
            onClick={() => open("add")}
            aria-label="Lançamento rápido (tecla N)"
            title="Lançamento rápido (N)"
            className="fixed right-5 bottom-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-primary text-3xl leading-none font-bold text-primary-fg shadow-lg transition hover:scale-105 active:scale-95"
          >
            +
          </button>,
          document.body,
        )}
      <button
        type="button"
        onClick={() => open("search")}
        className="flex w-full items-center justify-between rounded-full border border-border bg-background px-4 py-2 text-sm text-muted hover:text-foreground"
      >
        <span>Buscar…</span>
        <kbd className="hidden rounded bg-surface-2 px-1.5 text-xs md:inline">
          Ctrl K
        </kbd>
      </button>

      {/* Portal no body: a barra lateral (sticky) criaria um contexto que deixava a janela atrás do conteúdo */}
      {mode !== "closed" &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh]"
            onMouseDown={() => setMode("closed")}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={mode === "add" ? "Lançamento rápido" : "Buscar"}
              className="msg-in w-full max-w-lg rounded-[1.25rem] border border-border bg-surface p-3 shadow-2xl"
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                // Mantém o Tab dentro da janela enquanto ela está aberta
                if (e.key !== "Tab") return;
                const f = [...e.currentTarget.querySelectorAll<HTMLElement>("input, select, textarea, button:not([disabled]), a[href]")];
                if (!f.length) return;
                const first = f[0];
                const last = f[f.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first.focus();
                }
              }}
            >
              {mode === "add" ? (
                <form onSubmit={submitAdd} className="space-y-2">
                  <label
                    className="block px-1 text-sm font-bold"
                    htmlFor="quick-add"
                  >
                    Lançamento rápido
                  </label>
                  <input
                    id="quick-add"
                    ref={inputRef}
                    className="input"
                    placeholder="mercado 120 nubank · +3500 salário · uber 23,90 ontem"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    autoComplete="off"
                  />
                  <p className="px-1 text-xs text-muted">
                    Valor com “+” vira receita. Pode citar a conta e a data
                    (ontem, 05/11). A categoria vem das suas regras.
                  </p>
                  {msg && (
                    <p
                      key={msg.id}
                      role={msg.ok ? "status" : "alert"}
                      className={`px-1 text-sm ${msg.ok ? "text-primary" : "shake text-danger"}`}
                    >
                      {msg.text}
                    </p>
                  )}
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => setMode("closed")}
                    >
                      Fechar
                    </button>
                    <button className="btn" disabled={pending || !text.trim()}>
                      {pending ? "Salvando..." : "Lançar"}
                    </button>
                  </div>
                </form>
              ) : (
                <div>
                  <input
                    ref={inputRef}
                    className="input"
                    placeholder="Buscar lançamentos, contatos, categorias e páginas"
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      setActive(0);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setActive((a) => Math.min(a + 1, items.length - 1));
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setActive((a) => Math.max(a - 1, 0));
                      } else if (e.key === "Enter" && items[active])
                        go(items[active].href);
                    }}
                    autoComplete="off"
                  />
                  <ul
                    className="mt-2 max-h-[50vh] overflow-y-auto"
                    role="listbox"
                  >
                    {items.map((it, i) => (
                      <li
                        key={it.key}
                        role="option"
                        aria-selected={i === active}
                      >
                        <button
                          type="button"
                          onMouseEnter={() => setActive(i)}
                          onClick={() => go(it.href)}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm ${i === active ? "bg-primary-soft" : ""}`}
                        >
                          <span className="text-muted">
                            <NavIcon name={it.icon} />
                          </span>
                          <span className="min-w-0 flex-1 truncate font-semibold">
                            {it.title}
                          </span>
                          <span className="shrink-0 text-xs text-muted">
                            {it.subtitle}
                          </span>
                        </button>
                      </li>
                    ))}
                    {items.length === 0 && (
                      <li className="px-3 py-4 text-center text-sm text-muted">
                        Nada encontrado.
                      </li>
                    )}
                  </ul>
                  <p className="mt-2 px-1 text-xs text-muted">
                    ↑↓ para escolher · Enter para abrir · N para lançamento
                    rápido
                  </p>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
