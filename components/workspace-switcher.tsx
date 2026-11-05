"use client";

import { useRouter } from "next/navigation";

type Ws = { id: string; name: string; kind: string };

export function WorkspaceSwitcher({ workspaces, currentId }: { workspaces: Ws[]; currentId: string }) {
  const router = useRouter();
  const current = workspaces.find((w) => w.id === currentId);
  return (
    <label className="relative flex h-11 items-center gap-2.5 rounded-[10px] border border-border bg-background px-2.5 transition-colors focus-within:border-brand hover:border-border-strong">
      <span className="sr-only">Workspace</span>
      <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary-soft text-xs font-bold text-primary">
        {(current?.name ?? "?").charAt(0).toUpperCase()}
      </span>
      <select
        className="min-w-0 flex-1 appearance-none bg-transparent pr-6 text-sm font-semibold text-foreground outline-none"
        value={currentId}
        onChange={(e) => router.push(`/w/${e.target.value}/dashboard`)}
      >
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name} · {w.kind === "pj" ? "Empresa" : "Pessoal"}
          </option>
        ))}
      </select>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="pointer-events-none absolute right-3 text-muted">
        <path d="M7 10l5 5 5-5" />
      </svg>
    </label>
  );
}
