"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";
import { weakPasswordReason } from "@/lib/pwned";
import { rateLimit } from "@/lib/rate-limit";
import { logAccess } from "@/lib/access-log";
import { TERMS_VERSION } from "@/lib/legal";

// Autenticação no servidor: o navegador não precisa baixar a biblioteca do Supabase (~100 kB a menos).

export type AuthResult = { ok: boolean; text: string; redirect?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function origin() {
  const official = process.env.NEXT_PUBLIC_SITE_URL;
  if (official && !official.includes("localhost")) return official.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function clientIp() {
  const h = await headers();
  // Na Vercel, x-real-ip vem da própria plataforma (o cliente não consegue forjar)
  return h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",").pop()?.trim() || "local";
}

export async function authAction(input: {
  mode: "entrar" | "cadastrar" | "link" | "recuperar";
  email: string;
  password?: string;
  name?: string;
  next?: string;
  acceptTerms?: boolean;
}): Promise<AuthResult> {
  const email = String(input.email ?? "").trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 200) return { ok: false, text: "E-mail inválido" };
  const next = safeNext(input.next);
  // Freio contra força bruta: por IP e por e-mail (além dos limites do próprio Supabase)
  const ip = await clientIp();
  if (!rateLimit(`auth-ip:${ip}`, 30, 5 * 60_000) || !rateLimit(`auth-email:${email}`, 10, 5 * 60_000)) {
    return { ok: false, text: "Muitas tentativas. Aguarde alguns minutos e tente de novo." };
  }

  const supabase = await createClient();
  const site = await origin();
  const callback = (to: string) => `${site}/auth/callback?next=${encodeURIComponent(to)}`;

  if (input.mode === "recuperar") {
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: callback("/redefinir-senha") });
    // Mesma resposta exista ou não a conta: não revela quais e-mails estão cadastrados
    return { ok: true, text: "Se houver uma conta com esse e-mail, enviamos um link para criar uma nova senha." };
  }
  if (input.mode === "link") {
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: callback(next) } });
    if (error) return { ok: false, text: "Não foi possível enviar o link. Tente de novo em instantes." };
    return { ok: true, text: "Enviamos um link de acesso para o seu e-mail." };
  }

  const password = String(input.password ?? "");
  if (!password || password.length > 200) return { ok: false, text: "Informe a senha." };

  if (input.mode === "cadastrar") {
    // Aceite expresso dos Termos e da Política (fica registrado com a versão e a data)
    if (input.acceptTerms !== true) return { ok: false, text: "Para criar a conta, aceite os Termos de Serviço e a Política de Privacidade." };
    const weak = weakPasswordReason(password);
    if (weak) return { ok: false, text: weak };
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: callback(next),
        data: {
          // Nome é opcional (minimização de dados)
          ...(String(input.name ?? "").trim() ? { full_name: String(input.name).trim().slice(0, 120) } : {}),
          terms_version: TERMS_VERSION,
          terms_accepted_at: new Date().toISOString(),
        },
      },
    });
    if (error) return { ok: false, text: error.message.includes("registered") ? "Este e-mail já tem conta. Use Entrar." : "Não foi possível criar a conta." };
    if (data.session && data.user) {
      await logAccess(supabase, data.user.id);
      return { ok: true, text: "Conta criada!", redirect: next };
    }
    return { ok: true, text: "Conta criada. Confirme pelo link enviado ao seu e-mail." };
  }

  const { data: signed, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, text: "E-mail ou senha incorretos." };
  if (signed.user) await logAccess(supabase, signed.user.id);
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const needsCode = aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2";
  return { ok: true, text: "Entrando...", redirect: needsCode ? `/login/mfa?next=${encodeURIComponent(next)}` : next };
}

/** Segundo passo da verificação em duas etapas. */
export async function verifyMfaAction(code: string, nextRaw: string): Promise<AuthResult> {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { ok: false, text: "Sessão expirada. Entre de novo.", redirect: "/login" };
  if (!rateLimit(`mfa:${user.user.id}`, 10, 5 * 60_000)) return { ok: false, text: "Muitas tentativas. Aguarde alguns minutos." };
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp.find((f) => f.status === "verified");
  if (!factor) return { ok: false, text: "Nenhum autenticador encontrado." };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.replace(/\D/g, "").slice(0, 6) });
  if (error) return { ok: false, text: "Código inválido. Confira o horário do celular e tente de novo." };
  return { ok: true, text: "Verificado!", redirect: safeNext(nextRaw) };
}

/** Nova senha (depois do link de recuperação). */
export async function updatePasswordAction(password: string): Promise<AuthResult> {
  const weak = weakPasswordReason(password);
  if (weak) return { ok: false, text: weak };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, text: "Não foi possível trocar a senha. Peça um novo link." };
  return { ok: true, text: "Senha alterada! Entrando...", redirect: "/" };
}
