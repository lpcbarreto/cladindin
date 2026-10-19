import { loadWorkspaceContext } from "@/lib/workspace";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppNav } from "@/components/app-nav";
import { Logo } from "@/components/logo";

const NAV = [
  { href: "dashboard", label: "Início" },
  { href: "lancamentos", label: "Lançamentos" },
  { href: "importar", label: "Importar" },
  { href: "importacoes", label: "Importações" },
  { href: "contas", label: "Contas e cartões" },
  { href: "categorias", label: "Categorias" },
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
  const { user, workspaces, current } = await loadWorkspaceContext(workspaceId);
  const initial = (user.email ?? "?").charAt(0).toUpperCase();

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[260px_1fr]">
      <aside className="flex flex-col gap-5 border-b border-border bg-surface/70 p-4 backdrop-blur md:sticky md:top-0 md:h-dvh md:border-r md:border-b-0 md:p-5">
        <div className="flex items-center justify-between">
          <Logo size={34} />
          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
          </div>
        </div>
        <WorkspaceSwitcher workspaces={workspaces} currentId={current.id} />
        <AppNav base={`/w/${current.id}`} items={NAV} />
        <div className="mt-auto hidden space-y-3 md:block">
          <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent font-extrabold text-foreground">
              {initial}
            </span>
            <span className="min-w-0 truncate text-xs text-muted">{user.email}</span>
          </div>
          <div className="flex gap-2">
            <ThemeToggle />
            <form action="/auth/sair" method="post" className="flex-1">
              <button className="btn-ghost w-full">Sair</button>
            </form>
          </div>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl p-4 md:p-8">{children}</main>
    </div>
  );
}
