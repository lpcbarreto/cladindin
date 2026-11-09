import "server-only";
import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describeDevice, isNewDevice } from "@/lib/device";
import { newDeviceEmail, sendEmail } from "@/lib/notify";
import { siteUrl } from "@/lib/site-url";

/** IP do cliente. Na Vercel, x-real-ip vem da própria plataforma (não forjável). */
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  const ip = h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",").pop()?.trim() || null;
  // Só grava se for um IP válido (v4 ou v6)
  return ip && /^[0-9a-f:.]{3,45}$/i.test(ip) ? ip : null;
}

/**
 * Registro de acesso (Marco Civil, art. 15): guardado por 6 meses. Falha aqui nunca impede o login.
 * Se a pessoa entrou de um aparelho que nunca usou, manda um e-mail avisando (proteção contra senha vazada).
 */
export async function logAccess(supabase: SupabaseClient, userId: string, email?: string | null) {
  try {
    const h = await headers();
    const device = describeDevice(h.get("user-agent"));
    const ip = await clientIp();
    const { data: previous } = await supabase
      .from("access_log")
      .select("device")
      .eq("user_id", userId)
      .gte("at", new Date(Date.now() - 180 * 86_400_000).toISOString())
      .order("at", { ascending: false })
      .limit(300);
    await supabase.from("access_log").insert({ user_id: userId, ip, device });
    if (email && isNewDevice((previous ?? []).map((p) => p.device), device)) {
      const e = newDeviceEmail({ device, ip, when: new Date() }, siteUrl());
      await sendEmail(email, e.subject, e.html);
    }
  } catch {
    // sem registro não bloqueia o acesso
  }
}
