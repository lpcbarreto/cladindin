import { loadWorkspaceContext } from "@/lib/workspace";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppNav, type NavGroup } from "@/components/app-nav";
import { Logo, LogoMark } from "@/components/logo";
import { SidebarShell } from "@/components/sidebar-shell";
import { todayISO } from "@/lib/finance/dates";
import { CommandBar } from "@/components/command-bar";
import { MobileNav } from "@/components/mobile-nav";
import { UndoToast } from "@/components/undo-toast";
import { readUndo } from "./global-actions";
import { TermsBanner } from "@/components/terms-banner";
import { LegalFooter } from "@/components/legal-footer";
import { TERMS_VERSION } from "@/lib/legal";

const GROUPS: NavGroup[] = [
  {
    title: "Visão geral",
    items: [
      { href: "dashboard", label: "Início" },
      { href: "relatorios", label: "Relatórios" },
    ],
  },
  {
    title: "Movimentação",
    items: [
      { href: "lancamentos", label: "Lançamentos" },
      { href: "a-pagar", label: "A pagar e receber" },
      { href: "cartoes", label: "Cartões" },
      { href: "importar", label: "Importar extrato" },
      { href: "importacoes", label: "Importações" },
    ],
  },
  {
    title: "Planejamento",
    items: [
      { href: "planejamento", label: "Planejamento" },
      { href: "recorrencias", label: "Recorrências" },
      { href: "projecao", label: "Projeção" },
      { href: "orcamento", label: "Orçamento" },
      { href: "metas", label: "Metas" },
    ],
  },
  {
    title: "Cadastros",
    items: [
      { href: "contas", label: "Contas e cartões" },
      { href: "categorias", label: "Categorias" },
      { href: "regras", label: "Regras" },
      { href: "contatos", label: "Contatos" },
      { href: "configuracoes", label: "Configurações" },
    ],
  },
];
const NAV = GROUPS.flatMap((g) => g.items);

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const [ctx, undo] = await Promise.all([loadWorkspaceContext(workspaceId), readUndo()]);
  const { user, workspaces, current, supabase } = ctx;
  // Contador no menu: contas a pagar já vencidas (lançamentos e faturas de cartão)
  const today = todayISO();
  const [{ count: lateTx }, { count: lateInv }] = await Promise.all([
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("workspace_id", current.id).is("deleted_at", null).eq("status", "planned").eq("type", "expense").is("invoice_id", null).lt("due_date", today),
    supabase.from("invoice_summaries").select("id", { count: "exact", head: true }).eq("workspace_id", current.id).is("paid_at", null).gt("total_cents", 0).lt("due_date", today),
  ]);
  const badges = { "a-pagar": (lateTx ?? 0) + (lateInv ?? 0) };
  const initial = (user.email ?? "?").charAt(0).toUpperCase();
  const base = `/w/${current.id}`;

  const account = (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-xl border border-border p-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-semibold text-foreground">{initial}</span>
        <span className="min-w-0 truncate text-xs text-muted">{user.email}</span>
      </div>
      <ThemeToggle showLabels />
      <div className="grid grid-cols-2 gap-2">
        <a href="/ajuda" target="_blank" className="btn-ghost">
          Ajuda
        </a>
        <form action="/auth/sair" method="post">
          <button className="btn-ghost w-full">Sair</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh md:flex">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow">
        Pular para o conteúdo
      </a>

      {/* Menu lateral (computador), recolhível */}
      <SidebarShell>
        <div className="flex h-8 items-center gap-2.5 px-1.5">
          <LogoMark size={28} />
          <span className="font-display text-[19px] font-semibold tracking-[-0.03em] group-data-[collapsed=true]/side:hidden">cladindin</span>
        </div>
        <div className="group-data-[collapsed=true]/side:mt-9 group-data-[collapsed=true]/side:hidden">
          <WorkspaceSwitcher workspaces={workspaces} currentId={current.id} />
        </div>
        <div className="hidden h-9 group-data-[collapsed=true]/side:block" aria-hidden="true" />
        <AppNav base={base} groups={GROUPS} badges={badges} />
        <div className="mt-auto group-data-[collapsed=true]/side:hidden">{account}</div>
        <span
          className="mx-auto mt-auto hidden h-9 w-9 place-items-center rounded-full bg-surface-2 text-sm font-semibold group-data-[collapsed=true]/side:grid"
          title={user.email ?? undefined}
          aria-hidden="true"
        >
          {initial}
        </span>
      </SidebarShell>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior: busca e novo lançamento */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur md:px-8">
          <span className="md:hidden">
            <Logo size={26} />
          </span>
          <CommandBar workspaceId={current.id} nav={NAV} />
        </header>

        <main id="conteudo" tabIndex={-1} className="mx-auto w-full max-w-6xl p-4 pb-28 outline-none md:p-8 md:pb-16">
          {user.termsVersion !== TERMS_VERSION && <TermsBanner firstTime={!user.termsVersion} />}
          {children}
          <div className="mt-16">
            <LegalFooter compact />
          </div>
        </main>
      </div>

      {/* Celular: barra inferior + menu completo em "Mais" */}
      <MobileNav base={base}>
        <div className="space-y-5">
          <WorkspaceSwitcher workspaces={workspaces} currentId={current.id} />
          <AppNav base={base} groups={GROUPS} badges={badges} />
          {account}
        </div>
      </MobileNav>

      {undo?.ws === current.id && <UndoToast key={undo.ids.join()} count={undo.ids.length} />}
    </div>
  );
}
