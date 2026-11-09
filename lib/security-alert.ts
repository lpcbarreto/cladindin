import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/notify";
import { siteUrl } from "@/lib/site-url";

/** Sinais acompanhados e quantos em 10 minutos já merecem avisar o responsável pelo site. */
const SIGNALS = {
  "login-falhou": { limit: 30, text: "tentativas de login com senha errada" },
  "codigo-falhou": { limit: 15, text: "códigos de verificação em duas etapas errados" },
  "erros-site": { limit: 25, text: "erros nas telas dos usuários" },
  "acesso-negado": { limit: 20, text: "tentativas de acessar dados sem permissão" },
} as const;
export type SecuritySignal = keyof typeof SIGNALS;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Registra um sinal (sem dados pessoais). Se passar do limite em 10 minutos, manda um e-mail para
 * SECURITY_ALERT_EMAIL — no máximo um por tipo por hora. Nunca lança erro nem atrasa a resposta.
 */
export async function recordSecurityEvent(kind: SecuritySignal) {
  try {
    const db = adminClient();
    if (!db) return;
    await db.from("security_events").insert({ kind });
    const to = process.env.SECURITY_ALERT_EMAIL;
    if (!to) return;
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count } = await db.from("security_events").select("id", { count: "exact", head: true }).eq("kind", kind).gte("at", since);
    const signal = SIGNALS[kind];
    if ((count ?? 0) < signal.limit) return;
    const hour = new Date();
    hour.setUTCMinutes(0, 0, 0);
    // A chave (tipo, hora) garante um único e-mail por hora, mesmo com vários servidores ao mesmo tempo
    const { error } = await db.from("security_alert_log").insert({ kind, hour: hour.toISOString() });
    if (error) return;
    const title = `Alerta de segurança: ${count} ${signal.text}`;
    await sendEmail(
      to,
      title,
      `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;color:#111614;padding:24px">
<h1 style="font-size:18px">${esc(title)}</h1>
<p style="font-size:14px">Nos últimos 10 minutos o Cladindin registrou <b>${count}</b> ${esc(signal.text)}. Pode ser alguém tentando invadir contas ou um problema no site.</p>
<p style="font-size:14px"><b>O que fazer:</b> veja os logs na Vercel (Logs); se for ataque, ligue o "Attack Challenge Mode" em Firewall; siga o plano em docs/plano-de-incidente.md.</p>
<p style="font-size:12px;color:#6b776f">Site: ${esc(siteUrl())}. Você recebe no máximo um alerta deste tipo por hora.</p>
</body></html>`,
    );
  } catch {
    // alerta nunca pode quebrar o site
  }
}
