"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Ícones em dois tons (24×24): contorno na cor do texto + preenchimento suave (16%).
// s = contorno, f = preenchimento.
const ICONS: Record<string, { s: string; f: string }> = {
  dashboard: { s: "M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z", f: "M5 12 12 6.5 19 12v7.5h-4v-5H9v5H5z" },
  relatorios: { s: "M4 20h16M7 16v-5M12 16V7M17 16v-8", f: "M10.5 7h3v9h-3zM15.5 8h3v8h-3zM5.5 11h3v5h-3z" },
  lancamentos: { s: "M8 7h12M8 12h12M8 17h8M4 7h.01M4 12h.01M4 17h.01", f: "M7 5.5h14v3H7zM7 10.5h14v3H7z" },
  "a-pagar": { s: "M7 3v3M17 3v3M4 9h16M5 5.5h14a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1zM9 14.5l2 2 4-4", f: "M5 9h14v10H5z" },
  cartoes: { s: "M3 7.5A1.5 1.5 0 0 1 4.5 6h15A1.5 1.5 0 0 1 21 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5zM3 10h18M7 14.5h4", f: "M3 6h18v4H3z" },
  importar: { s: "M12 4v11m0 0-4-4m4 4 4-4M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3", f: "M5 15h14v3a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" },
  importacoes: { s: "M12 8v4l3 2M20.5 12a8.5 8.5 0 1 1-2.6-6.1M21 4v5h-5", f: "M12 20.5a8.5 8.5 0 1 1 0-17 8.5 8.5 0 0 1 0 17z" },
  planejamento: { s: "M8 3v3M16 3v3M4 9h16M5 5.5h14a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1zM8 13h3M8 16.5h6", f: "M4.5 6h15v3h-15z" },
  recorrencias: { s: "M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4", f: "M7 7.5h11v3H7zM6 13.5h11v3H6z" },
  projecao: { s: "M3 17l5-5 4 3 8-8M15 7h5v5", f: "M3 17l5-5 4 3 8-8v13H3z" },
  orcamento: { s: "M12 3a9 9 0 1 0 9 9h-9zM15 2.6A9 9 0 0 1 21.4 9H15z", f: "M15 2.6A9 9 0 0 1 21.4 9H15z" },
  metas: { s: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 12h.01", f: "M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z" },
  contas: { s: "M3 10h18M5 10V8l7-4 7 4v2M6 10v8m4-8v8m4-8v8m4-8v8M4 21h16", f: "M5 8l7-4 7 4v2H5z" },
  categorias: { s: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM16.5 13a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z", f: "M13 4h7v7h-7z" },
  regras: { s: "M4 6h10M4 12h7M4 18h10M17 4l3 3-3 3M17 14l3 3-3 3", f: "M3 4.5h11v3H3zM3 16.5h11v3H3z" },
  contatos: { s: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 19v-1a4 4 0 0 0-3-3.9M16 3.6a3.5 3.5 0 0 1 0 6.8", f: "M9.5 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" },
  conciliacao: { s: "M7 7h10M7 7l3-3M7 7l3 3M17 17H7M17 17l-3-3M17 17l-3 3", f: "M4 4h16v6H4z" },
  "centros-custo": { s: "M12 3v18M3 12h18M5 5h14v14H5z", f: "M5 5h7v7H5z" },
  equipe: { s: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20v-1a5 5 0 0 1 5-5h2M15.5 14.5l2 2 4-4", f: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" },
  configuracoes: {
    s: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 4.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4z",
    f: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  },
};

export function NavIcon({ name, size = 18 }: { name: string; size?: number }) {
  const icon = ICONS[name];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
      {icon && <path d={icon.f} fill="currentColor" fillOpacity={0.16} />}
      {icon && <path d={icon.s} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

export type NavItem = { href: string; label: string };
export type NavGroup = { title: string; items: NavItem[] };

const CLOSED_KEY = "menu-grupos-fechados";

/**
 * Menu principal: grupos que abrem e fecham (a escolha fica salva neste navegador),
 * item ativo com ícone em destaque e contadores (ex.: contas atrasadas).
 * Dentro de um menu recolhido (data-collapsed no <aside>), mostra só os ícones, com o nome ao passar o mouse.
 */
export function AppNav({
  base,
  groups,
  badges = {},
  onNavigate,
}: {
  base: string;
  groups: NavGroup[];
  badges?: Record<string, number>;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const [closed, setClosed] = useState<string[]>([]);

  useEffect(() => {
    try {
      setClosed(JSON.parse(localStorage.getItem(CLOSED_KEY) ?? "[]"));
    } catch {
      setClosed([]);
    }
  }, []);

  function toggle(title: string) {
    const next = closed.includes(title) ? closed.filter((t) => t !== title) : [...closed, title];
    setClosed(next);
    try {
      localStorage.setItem(CLOSED_KEY, JSON.stringify(next));
    } catch {
      // sem armazenamento: vale só nesta visita
    }
  }

  return (
    <nav aria-label="Menu principal" className="flex flex-col gap-2.5">
      {groups.map((g) => {
        const hasActive = g.items.some((i) => pathname.startsWith(`${base}/${i.href}`));
        // O grupo do item aberto nunca fica escondido
        const open = !closed.includes(g.title) || hasActive;
        const id = `grupo-${g.title.normalize("NFD").replace(/[^\w]/g, "").toLowerCase()}`;
        return (
          <div key={g.title} className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => toggle(g.title)}
              aria-expanded={open}
              aria-controls={id}
              className="nav-group flex items-center justify-between rounded-md px-2.5 py-1 text-[11px] font-semibold tracking-[0.06em] text-muted uppercase transition-colors hover:text-foreground group-data-[collapsed=true]/side:hidden"
            >
              {g.title}
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                aria-hidden="true"
                className={`transition-transform duration-200 ${open ? "" : "-rotate-90"}`}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <div id={id} className={`flex flex-col gap-0.5 ${open ? "nav-open" : "hidden group-data-[collapsed=true]/side:flex"}`}>
              {g.items.map((item) => {
                const href = `${base}/${item.href}`;
                const active = pathname === href || pathname.startsWith(`${href}/`);
                const badge = badges[item.href] ?? 0;
                return (
                  <Link
                    key={item.href}
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    aria-label={badge ? `${item.label} (${badge} atrasada${badge > 1 ? "s" : ""})` : undefined}
                    className={`nav-item group/item relative flex h-10 items-center gap-2.5 rounded-[10px] px-2 text-sm whitespace-nowrap transition-colors duration-150 group-data-[collapsed=true]/side:justify-center ${
                      active ? "bg-primary-soft font-semibold text-foreground" : "font-medium text-muted hover:bg-surface-2 hover:text-foreground"
                    }`}
                  >
                    <span
                      className={`nav-icon grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] ${
                        active ? "bg-brand text-white shadow-[0_4px_10px_-4px_var(--brand)]" : "text-muted group-hover/item:text-foreground"
                      }`}
                    >
                      <NavIcon name={item.href} />
                    </span>
                    <span className="flex-1 group-data-[collapsed=true]/side:hidden">{item.label}</span>
                    {badge > 0 && (
                      <>
                        <span className="nav-badge grid h-5 min-w-5 place-items-center rounded-full bg-danger-soft px-1.5 text-[11px] font-bold text-danger tabular-nums group-data-[collapsed=true]/side:hidden">
                          {badge > 99 ? "99+" : badge}
                        </span>
                        <span aria-hidden="true" className="absolute top-1.5 right-2 hidden h-[7px] w-[7px] rounded-full bg-danger ring-2 ring-surface group-data-[collapsed=true]/side:block" />
                      </>
                    )}
                    {/* Nome ao passar o mouse quando o menu está recolhido */}
                    <span
                      role="tooltip"
                      className="pointer-events-none absolute top-1/2 left-[calc(100%+10px)] z-50 hidden -translate-y-1/2 rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-background opacity-0 shadow-lg transition-opacity group-hover/item:opacity-100 group-focus-visible/item:opacity-100 group-data-[collapsed=true]/side:block"
                    >
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
