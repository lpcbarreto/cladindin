import { loadWorkspaceContext } from "@/lib/workspace";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppNav } from "@/components/app-nav";
import { Logo } from "@/components/logo";
import { CommandBar } from "@/components/command-bar";
import { UndoToast } from "@/components/undo-toast";
import { readUndo } from "./global-actions";
import { TermsBanner } from "@/components/terms-banner";
import { LegalFooter } from "@/components/legal-footer";
import { TERMS_VERSION } from "@/lib/legal";

const NAV = [
  { href: "dashboard", label: "Início" },
  { href: "lancamentos", label: "Lançamentos" },
  { href: "a-pagar", label: "A pagar/receber" },
  { href: "recorrencias", label: "Recorrências" },
  { href: "projecao", label: "Projeção" },
  { href: "metas", label: "Metas" },
  { href: "importar", label: "Importar" },
  { href: "importacoes", label: "Importações" },
  { href: "cartoes", label: "Cartões" },
  { href: "contas", label: "Contas e cartões" },
  { href: "relatorios", label: "Relatórios" },
  { href: "orcamento", label: "Orçamento" },
  { href: "categorias", label: "Categorias" },
  { href: "regras", label: "Regras" },
  { href: "contatos", label: "Contatos" },
  { href: "configuracoes", label: "Configurações" },
];

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const [{ user, workspaces, current }, undo] = await Promise.all([loadWorkspaceContext(workspaceId), readUndo()]);
  const initial = (user.email ?? "?").charAt(0).toUpperCase();

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[260px_1fr]">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow">
        Pular para o conteúdo
      </a>
      <aside className="flex flex-col gap-5 border-b border-border bg-surface p-4 md:sticky md:top-0 md:h-dvh md:overflow-y-auto md:overscroll-contain md:border-r md:border-b-0 md:p-5">
        <div className="flex items-center justify-between">
          <Logo size={28} />
          <div className="w-32 md:hidden">
            <ThemeToggle />
          </div>
        </div>
        <WorkspaceSwitcher workspaces={workspaces} currentId={current.id} />
        <CommandBar workspaceId={current.id} nav={NAV} />
        <AppNav base={`/w/${current.id}`} items={NAV} />
        <div className="mt-auto hidden space-y-3 md:block">
          <div className="flex items-center gap-3 rounded-xl border border-border p-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface-2 text-sm font-semibold text-foreground">
              {initial}
            </span>
            <span className="min-w-0 truncate text-xs text-muted">{user.email}</span>
          </div>
          <ThemeToggle showLabels />
          <a href="/ajuda" target="_blank" className="btn-ghost w-full">
            Central de Ajuda
          </a>
          <form action="/auth/sair" method="post">
            <button className="btn-ghost w-full">Sair</button>
          </form>
        </div>
      </aside>
      <main id="conteudo" tabIndex={-1} className="mx-auto w-full max-w-6xl p-4 pb-24 outline-none md:p-8 md:pb-24">
        {user.termsVersion !== TERMS_VERSION && <TermsBanner firstTime={!user.termsVersion} />}
        {children}
        <div className="mt-16">
          <LegalFooter compact />
        </div>
      </main>
      {undo?.ws === current.id && <UndoToast key={undo.ids.join()} count={undo.ids.length} />}
    </div>
  );
}
