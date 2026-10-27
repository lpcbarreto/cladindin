import { formatBRL } from "@/lib/finance/money";
import { formatDateBR } from "@/lib/finance/dates";

export type DueItem = { workspace: string; description: string; dueDate: string; cents: number; kind: "income" | "expense" };
export type WeeklyData = {
  workspace: string;
  income: number;
  expense: number;
  overdue: number;
  nextWeek: DueItem[];
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(title: string, body: string, siteUrl: string) {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#fafaf9;font-family:Arial,sans-serif;color:#111614">
<div style="max-width:560px;margin:0 auto;padding:24px">
<p style="font-size:20px;font-weight:700;color:#0f9d6e;margin:0 0 16px">Cladindin</p>
<div style="background:#fff;border-radius:16px;padding:24px">
<h1 style="font-size:18px;margin:0 0 12px">${esc(title)}</h1>${body}
<p style="margin:24px 0 0"><a href="${esc(siteUrl)}" style="background:#0b7f57;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:700">Abrir o Cladindin</a></p>
</div>
<p style="font-size:12px;color:#6b776f;margin-top:16px">Você recebe este e-mail porque ativou os avisos. Para parar, desligue em Configurações › Avisos.</p>
</div></body></html>`;
}

function itemsTable(items: DueItem[]) {
  return `<table style="width:100%;border-collapse:collapse;font-size:14px">${items
    .map(
      (i) => `<tr style="border-top:1px solid #e6ebe4"><td style="padding:8px 0;color:#6b776f;white-space:nowrap">${formatDateBR(i.dueDate)}</td>
<td style="padding:8px">${esc(i.description)}<br><span style="font-size:12px;color:#6b776f">${esc(i.workspace)}</span></td>
<td style="padding:8px 0;text-align:right;white-space:nowrap;font-weight:700;color:${i.kind === "income" ? "#1baf7a" : "#c4461a"}">${formatBRL(i.cents)}</td></tr>`,
    )
    .join("")}</table>`;
}

export function dueEmail(items: DueItem[], siteUrl: string) {
  const pay = items.filter((i) => i.kind === "expense").reduce((s, i) => s + i.cents, 0);
  const title = items.length === 1 ? "1 conta vence em breve" : `${items.length} contas vencem em breve`;
  const body = `<p style="font-size:14px">Total a pagar: <b>${formatBRL(pay)}</b></p>${itemsTable(items)}`;
  return { subject: title, html: layout(title, body, siteUrl) };
}

export function weeklyEmail(data: WeeklyData[], siteUrl: string) {
  const body = data
    .map(
      (w) => `<h2 style="font-size:15px;margin:16px 0 8px">${esc(w.workspace)}</h2>
<p style="font-size:14px;margin:0">Últimos 7 dias: entrou <b style="color:#0b7f57">${formatBRL(w.income)}</b>, saiu <b style="color:#c4461a">${formatBRL(w.expense)}</b>.</p>
${w.overdue ? `<p style="font-size:14px;color:#c4461a;margin:6px 0 0"><b>${w.overdue}</b> conta(s) atrasada(s).</p>` : ""}
${w.nextWeek.length ? `<p style="font-size:14px;margin:12px 0 4px">Próximos 7 dias:</p>${itemsTable(w.nextWeek.slice(0, 10))}` : `<p style="font-size:14px;color:#6b776f">Nada vence nos próximos 7 dias.</p>`}`,
    )
    .join("");
  return { subject: "Seu resumo semanal", html: layout("Resumo da semana", body, siteUrl) };
}

/** Envia pelo Resend (https://resend.com). Sem RESEND_API_KEY, não envia nada. */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Cladindin <onboarding@resend.dev>";
  if (!key) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });
  return res.ok;
}
