"use server";

import { createClient } from "@/lib/supabase/server";

// Verificação em duas etapas e sessões, feitas no servidor (sem a biblioteca do Supabase no navegador)

async function session() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Sessão expirada");
  return supabase;
}

export async function mfaStatus(): Promise<string | null> {
  const supabase = await session();
  const { data } = await supabase.auth.mfa.listFactors();
  return data?.totp.find((f) => f.status === "verified")?.id ?? null;
}

export async function mfaEnroll(): Promise<{ factorId: string; qr: string; secret: string } | null> {
  const supabase = await session();
  // Remove tentativas anteriores não concluídas
  const { data: list } = await supabase.auth.mfa.listFactors();
  for (const f of list?.all ?? []) if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Cladindin ${Date.now()}` });
  if (error || !data) return null;
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

export async function mfaConfirm(factorId: string, code: string): Promise<boolean> {
  const supabase = await session();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\D/g, "").slice(0, 6) });
  return !error;
}

export async function mfaDisable(factorId: string): Promise<boolean> {
  const supabase = await session();
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  return !error;
}

export async function signOutEverywhere() {
  const supabase = await session();
  await supabase.auth.signOut({ scope: "global" });
}
