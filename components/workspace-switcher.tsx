"use client";

import { useRouter } from "next/navigation";

type Ws = { id: string; name: string; kind: string };

export function WorkspaceSwitcher({ workspaces, currentId }: { workspaces: Ws[]; currentId: string }) {
  const router = useRouter();
  return (
    <label className="block text-xs text-muted">
      Workspace
      <select
        className="input mt-1"
        value={currentId}
        onChange={(e) => router.push(`/w/${e.target.value}/dashboard`)}
      >
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name} ({w.kind.toUpperCase()})
          </option>
        ))}
      </select>
    </label>
  );
}
