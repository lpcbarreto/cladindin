import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { todayISO } from "@/lib/finance/dates";
import { runBackup } from "@/lib/backup";
import { runRetention } from "@/lib/retention";
import { sendEmail } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Job diário (ver vercel.json): backup cifrado de todo o banco e limpeza da lixeira (30 dias).
 * Requer CRON_SECRET, SUPABASE_SERVICE_ROLE_KEY e BACKUP_KEY. Se algo falhar, avisa SECURITY_ALERT_EMAIL.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada" }, { status: 500 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { persistSession: false } });

  const result: Record<string, unknown> = {};
  const problems: string[] = [];
  try {
    result.backup = await runBackup(db, todayISO());
  } catch (e) {
    problems.push(e instanceof Error ? e.message : "backup falhou");
  }
  try {
    result.limpeza = await runRetention(db);
  } catch (e) {
    problems.push(e instanceof Error ? e.message : "limpeza falhou");
  }
  const alert = process.env.SECURITY_ALERT_EMAIL;
  if (problems.length && alert) {
    await sendEmail(alert, "Cladindin: falha na manutenção diária", `<p>A manutenção diária teve problemas:</p><ul>${problems.map((p) => `<li>${p.replace(/[<>&]/g, "")}</li>`).join("")}</ul><p>Veja os logs da Vercel.</p>`);
  }
  // Só contagens no log: nenhum dado de usuário
  return NextResponse.json({ ...result, problems }, { status: problems.length ? 500 : 200 });
}
