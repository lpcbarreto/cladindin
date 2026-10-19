import { cache } from "react";
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

/**
 * Usuário da sessão, validado pela assinatura do JWT (chaves assimétricas do Supabase):
 * sem ida ao servidor de autenticação a cada página. Mutations continuam protegidas pelo RLS.
 * cache(): layout e página da mesma requisição compartilham o resultado.
 */
const loadSession = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return { supabase, user: null };
  return { supabase, user: { id: claims.sub, email: (claims.email as string | undefined) ?? null } };
});

const loadMemberships = cache(async (userId: string) => {
  const { supabase } = await loadSession();
  const { data } = await supabase
    .from("workspace_members")
    .select("role, workspace:workspaces(id, name, kind)")
    .eq("user_id", userId)
    .order("created_at");
  return (data ?? []).flatMap((m) => {
    const ws = m.workspace as unknown as { id: string; name: string; kind: string } | null;
    return ws ? [{ ...ws, role: m.role as Role }] : [];
  });
});

/** Carrega o usuário, os workspaces dele e o papel no workspace atual. RLS garante o isolamento. */
export async function loadWorkspaceContext(workspaceId: string) {
  const { supabase, user } = await loadSession();
  if (!user) redirect("/login");
  const workspaces = await loadMemberships(user.id);
  const current = workspaces.find((w) => w.id === workspaceId);
  if (!current) notFound();
  return { supabase, user, workspaces, current };
}
