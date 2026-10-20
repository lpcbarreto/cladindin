import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateRule, RULE_COLUMNS, type RuleRow } from "@/lib/recurrence-server";
import { todayISO } from "@/lib/finance/dates";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Job diário (Vercel Cron, ver vercel.json): mantém 12 meses de previstos para todas as
 * regras ativas. Idempotente. Requer CRON_SECRET e SUPABASE_SERVICE_ROLE_KEY (somente no servidor).
 * Mesmo sem o job, as telas completam a janela ao serem abertas.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada" }, { status: 500 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { persistSession: false } });
  const today = todayISO();
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 11);
  const threshold = d.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("recurrence_rules")
    .select(RULE_COLUMNS)
    .eq("status", "active")
    .or(`generated_until.is.null,generated_until.lt.${threshold}`)
    .limit(1000);
  if (error) return NextResponse.json({ error: "falha ao listar regras" }, { status: 500 });

  let created = 0;
  let failed = 0;
  for (const rule of (data ?? []) as RuleRow[]) {
    try {
      created += (await generateRule(supabase, rule, today)).created;
    } catch {
      failed++;
    }
  }
  // Faxina do limite de tentativas (registros com mais de 1 dia)
  await supabase.rpc("purge_rate_limit_hits");
  // Só contagens no log: nada de dados financeiros
  return NextResponse.json({ rules: data?.length ?? 0, created, failed });
}
