import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * true quando a pessoa ativou a verificação em duas etapas mas a sessão ainda não passou pelo código.
 * Lê só a sessão local (sem ida à rede).
 */
export async function needsMfa(supabase: SupabaseClient, aal: unknown) {
  if (aal === "aal2") return false;
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return data?.nextLevel === "aal2" && data.currentLevel !== "aal2";
}
