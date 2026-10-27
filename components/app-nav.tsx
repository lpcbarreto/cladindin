"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Ícones de traço simples (24×24), herdam a cor do texto
const ICONS: Record<string, React.ReactNode> = {
  dashboard: <path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z" />,
  lancamentos: <path d="M4 6h16M4 12h16M4 18h10" />,
  importar: <path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" />,
  importacoes: <path d="M12 8v4l3 2M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" />,
  "a-pagar": <path d="M8 2v4M16 2v4M3 9h18M5 5h14v16H5zM9 15l2 2 4-4" />,
  recorrencias: <path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3" />,
  projecao: <path d="M3 17l5-5 4 3 8-8M15 7h5v5" />,
  metas: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01" />,
  orcamento: <path d="M12 3a9 9 0 1 0 9 9h-9zM15 2.5A9 9 0 0 1 21.5 9H15z" />,
  relatorios: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  regras: <path d="M4 6h10M4 12h7M4 18h10M17 4l3 3-3 3M17 14l3 3-3 3" />,
  cartoes: <path d="M3 6h18v12H3zM3 10h18M7 15h4" />,
  contas: <path d="M3 10h18M5 10V8l7-4 7 4v2M6 10v8m4-8v8m4-8v8m4-8v8M4 21h16" />,
  categorias: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM16.5 13a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z" />,
  contatos: <path d="M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 19v-1a4 4 0 0 0-3-3.9M16 3.1a3.5 3.5 0 0 1 0 6.8" />,
  configuracoes: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />,
};

export function NavIcon({ name }: { name: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

export function AppNav({ base, items }: { base: string; items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-col md:overflow-visible md:px-0">
      {items.map((item) => {
        const href = `${base}/${item.href}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={item.href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors ${
              active ? "bg-primary-soft font-semibold text-foreground shadow-[inset_2px_0_0_var(--brand)]" : "font-medium text-muted hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            <NavIcon name={item.href} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
