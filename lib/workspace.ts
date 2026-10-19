import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "owner" | "admin" | "editor" | "viewer";
const RANK: Record<Role, number> = { owner: 4, admin: 3, editor: 2, viewer: 1 };

export function hasRole(role: Role, min: Role) {
  return RANK[role] >= RANK[min];
}

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  editor: "Editor",
  viewer: "Leitor",
};

/** Carrega o usuário, os workspaces dele e o papel no workspace atual. RLS garante o isolamento. */
export async function loadWorkspaceContext(workspaceId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("workspace_members")
    .select("role, workspace:workspaces(id, name, kind)")
    .eq("user_id", user.id)
    .order("created_at");

  const workspaces = (memberships ?? []).flatMap((m) => {
    const ws = m.workspace as unknown as { id: string; name: string; kind: string } | null;
    return ws ? [{ ...ws, role: m.role as Role }] : [];
  });
  const current = workspaces.find((w) => w.id === workspaceId);
  if (!current) notFound();
  return { supabase, user, workspaces, current };
}
