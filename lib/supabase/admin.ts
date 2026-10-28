import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente com a chave secreta (ignora RLS). Só para o que o próprio usuário não pode fazer:
 * excluir a conta de autenticação e gravar pedidos LGPD. Nunca expor ao navegador.
 */
export function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
