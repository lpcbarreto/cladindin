import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { addDays, todayISO } from "@/lib/finance/dates";
import { dueEmail, sendEmail, weeklyEmail, type DueItem, type WeeklyData } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Job diário (ver vercel.json): avisa por e-mail as contas que vencem nos próximos dias e,
 * às segundas, manda o resumo semanal. Usa notification_log para não repetir.
 * Requer CRON_SECRET, SUPABASE_SERVICE_ROLE_KEY e RESEND_API_KEY.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada" }, { status: 500 });
  if (!process.env.RESEND_API_KEY) return NextResponse.json({ skipped: "RESEND_API_KEY não configurada" });

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { persistSession: false } });
  const today = todayISO();
  const isMonday = new Date(`${today}T12:00:00Z`).getUTCDay() === 1;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || `https://${request.headers.get("host")}`;

  const [{ data: members }, { data: prefs }, { data: sent }] = await Promise.all([
    db.from("workspace_members").select("user_id, workspace_id, workspace:workspaces(name)"),
    db.from("notification_prefs").select("user_id, due_alerts, days_before, weekly_summary"),
    db.from("notification_log").select("user_id, kind").eq("ref_date", today),
  ]);
  const prefOf = new Map((prefs ?? []).map((p) => [p.user_id, p]));
  const already = new Set((sent ?? []).map((s) => `${s.user_id}:${s.kind}`));
  const byUser = new Map<string, { id: string; name: string }[]>();
  for (const m of members ?? []) {
    const ws = m.workspace as unknown as { name: string } | null;
    if (!ws) continue;
    byUser.set(m.user_id, [...(byUser.get(m.user_id) ?? []), { id: m.workspace_id, name: ws.name }]);
  }

  let dueSent = 0;
  let weeklySent = 0;
  let failed = 0;
  for (const [userId, workspaces] of byUser) {
    const pref = prefOf.get(userId) ?? { due_alerts: true, days_before: 1, weekly_summary: true };
    const wantDue = pref.due_alerts && !already.has(`${userId}:due`);
    const wantWeekly = isMonday && pref.weekly_summary && !already.has(`${userId}:weekly`);
    if (!wantDue && !wantWeekly) continue;
    try {
      const { data: u } = await db.auth.admin.getUserById(userId);
      const email = u.user?.email;
      if (!email) continue;
      const wsIds = workspaces.map((w) => w.id);
      const wsName = new Map(workspaces.map((w) => [w.id, w.name]));

      if (wantDue) {
        const until = addDays(today, pref.days_before);
        const [{ data: txs }, { data: invs }] = await Promise.all([
          db
            .from("transactions")
            .select("workspace_id, description, due_date, amount_cents, type")
            .in("workspace_id", wsIds)
            .is("deleted_at", null)
            .eq("status", "planned")
            .eq("type", "expense")
            .is("invoice_id", null)
            .gte("due_date", today)
            .lte("due_date", until)
            .order("due_date")
            .limit(50),
          db
            .from("invoice_summaries")
            .select("workspace_id, due_date, total_cents")
            .in("workspace_id", wsIds)
            .is("paid_at", null)
            .gt("total_cents", 0)
            .gte("due_date", today)
            .lte("due_date", until),
        ]);
        const items: DueItem[] = [
          ...(txs ?? []).map((t) => ({ workspace: wsName.get(t.workspace_id)!, description: t.description, dueDate: t.due_date, cents: t.amount_cents, kind: "expense" as const })),
          ...(invs ?? []).map((i) => ({ workspace: wsName.get(i.workspace_id)!, description: "Fatura do cartão", dueDate: i.due_date, cents: Number(i.total_cents), kind: "expense" as const })),
        ].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        if (items.length) {
          const e = dueEmail(items, siteUrl);
          if (await sendEmail(email, e.subject, e.html)) {
            await db.from("notification_log").insert({ user_id: userId, kind: "due", ref_date: today });
            dueSent++;
          } else failed++;
        }
      }

      if (wantWeekly) {
        const weekAgo = addDays(today, -7);
        const nextWeek = addDays(today, 7);
        const data: WeeklyData[] = [];
        for (const w of workspaces) {
          const [{ data: paid }, { data: upcoming }, { count }] = await Promise.all([
            db
              .from("transactions")
              .select("type, direction, amount_cents")
              .eq("workspace_id", w.id)
              .is("deleted_at", null)
              .eq("status", "paid")
              .in("type", ["income", "expense"])
              .gte("paid_date", weekAgo)
              .lt("paid_date", today),
            db
              .from("transactions")
              .select("description, due_date, amount_cents, type")
              .eq("workspace_id", w.id)
              .is("deleted_at", null)
              .eq("status", "planned")
              .in("type", ["income", "expense"])
              .is("invoice_id", null)
              .gte("due_date", today)
              .lte("due_date", nextWeek)
              .order("due_date")
              .limit(10),
            db
              .from("transactions")
              .select("id", { count: "exact", head: true })
              .eq("workspace_id", w.id)
              .is("deleted_at", null)
              .eq("status", "planned")
              .eq("type", "expense")
              .lt("due_date", today),
          ]);
          const income = (paid ?? []).filter((t) => t.type === "income").reduce((s, t) => s + t.amount_cents, 0);
          const expense = (paid ?? []).filter((t) => t.type === "expense").reduce((s, t) => s - t.direction * t.amount_cents, 0);
          if (!income && !expense && !count && !upcoming?.length) continue;
          data.push({
            workspace: w.name,
            income,
            expense,
            overdue: count ?? 0,
            nextWeek: (upcoming ?? []).map((t) => ({ workspace: w.name, description: t.description, dueDate: t.due_date, cents: t.amount_cents, kind: t.type as DueItem["kind"] })),
          });
        }
        if (data.length) {
          const e = weeklyEmail(data, siteUrl);
          if (await sendEmail(email, e.subject, e.html)) {
            await db.from("notification_log").insert({ user_id: userId, kind: "weekly", ref_date: today });
            weeklySent++;
          } else failed++;
        }
      }
    } catch {
      failed++;
    }
  }
  // Só contagens no log: nada de dados financeiros nem e-mails
  return NextResponse.json({ users: byUser.size, dueSent, weeklySent, failed });
}
