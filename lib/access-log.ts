import "server-only";
import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

/** IP do cliente. Na Vercel, x-real-ip vem da própria plataforma (não forjável). */
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  const ip = h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",").pop()?.trim() || null;
  // Só grava se for um IP válido (v4 ou v6)
  return ip && /^[0-9a-f:.]{3,45}$/i.test(ip) ? ip : null;
}

/** Registro de acesso (Marco Civil, art. 15): guardado por 6 meses. Falha aqui nunca impede o login. */
export async function logAccess(supabase: SupabaseClient, userId: string) {
  try {
    await supabase.from("access_log").insert({ user_id: userId, ip: await clientIp() });
  } catch {
    // sem registro não bloqueia o acesso
  }
}
