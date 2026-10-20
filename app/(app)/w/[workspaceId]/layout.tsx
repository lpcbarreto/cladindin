import { loadWorkspaceContext } from "@/lib/workspace";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppNav } from "@/components/app-nav";
import { Logo } from "@/components/logo";
import { CommandBar } from "@/components/command-bar";
import { UndoToast } from "@/components/undo-toast";
import { readUndo } from "./global-actions";

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
      <aside className="flex flex-col gap-5 border-b border-border bg-surface p-4 md:sticky md:top-0 md:h-dvh md:overflow-y-auto md:overscroll-contain md:border-r md:border-b-0 md:p-5">
        <div className="flex items-center justify-between">
          <Logo size={34} />
          <div className="w-32 md:hidden">
            <ThemeToggle />
          </div>
        </div>
        <WorkspaceSwitcher workspaces={workspaces} currentId={current.id} />
        <CommandBar workspaceId={current.id} nav={NAV} />
        <AppNav base={`/w/${current.id}`} items={NAV} />
        <div className="mt-auto hidden space-y-3 md:block">
          <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent font-extrabold text-foreground">
              {initial}
            </span>
            <span className="min-w-0 truncate text-xs text-muted">{user.email}</span>
          </div>
          <ThemeToggle showLabels />
          <form action="/auth/sair" method="post">
            <button className="btn-ghost w-full">Sair</button>
          </form>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl p-4 pb-24 md:p-8 md:pb-24">{children}</main>
      {undo?.ws === current.id && <UndoToast key={undo.ids.join()} count={undo.ids.length} />}
    </div>
  );
}
