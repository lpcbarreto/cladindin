import Link from "next/link";
import { loadWorkspaceContext } from "@/lib/workspace";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV = [
  { href: "dashboard", label: "Dashboard" },
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

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[240px_1fr]">
      <aside className="flex flex-col gap-4 border-b border-border bg-surface p-4 md:min-h-dvh md:border-r md:border-b-0">
        <div className="text-lg font-semibold">Cladindin</div>
        <WorkspaceSwitcher workspaces={workspaces} currentId={current.id} />
        <nav className="flex gap-1 overflow-x-auto md:flex-col">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={`/w/${current.id}/${item.href}`}
              className="rounded-md px-3 py-2 text-sm whitespace-nowrap hover:bg-background"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto hidden space-y-2 md:block">
          <p className="truncate text-xs text-muted">{user.email}</p>
          <div className="flex gap-2">
            <ThemeToggle />
            <form action="/auth/sair" method="post">
              <button className="btn-ghost">Sair</button>
            </form>
          </div>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl p-4 md:p-8">{children}</main>
    </div>
  );
}
