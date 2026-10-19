import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { monthRange, shiftMonth, todayISO } from "@/lib/finance/dates";
import { balanceSeries, categoryByMonth, dre, groupBy, monthlyFlow, monthsBetween, type Basis } from "@/lib/finance/reports";
import { loadBalanceMoves, loadReportTx } from "@/lib/reports-server";

export const REPORTS = {
  fluxo: "Fluxo de caixa",
  categorias: "Por categoria / contato",
  comparativo: "Comparativo mês a mês",
  dre: "DRE simplificado",
  saldo: "Evolução do saldo",
} as const;
export type ReportKey = keyof typeof REPORTS;

export type ReportParams = {
  r: ReportKey;
  de: string;
  ate: string;
  base: Basis;
  dim: "categoria" | "contato" | "centro";
  tipo: "income" | "expense";
  conta: string | null;
};

const MONTH = /^\d{4}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

export function parseReportParams(sp: Record<string, string | undefined>): ReportParams {
  const now = todayISO().slice(0, 7);
  const ate = sp.ate && MONTH.test(sp.ate) ? sp.ate : now;
  let de = sp.de && MONTH.test(sp.de) ? sp.de : shiftMonth(ate, -5);
  if (de > ate) de = ate;
  if (monthsBetween(de, ate).length > 36) de = shiftMonth(ate, -35);
  return {
    r: (sp.r && sp.r in REPORTS ? sp.r : "fluxo") as ReportKey,
    de,
    ate,
    base: sp.base === "caixa" ? "caixa" : "competencia",
    dim: sp.dim === "contato" || sp.dim === "centro" ? sp.dim : "categoria",
    tipo: sp.tipo === "income" ? "income" : "expense",
    conta: sp.conta && UUID.test(sp.conta) ? sp.conta : null,
  };
}

/** Carrega e calcula os dados do relatório escolhido. */
export async function buildReport(supabase: SupabaseClient, workspaceId: string, p: ReportParams) {
  const from = monthRange(p.de).start;
  const to = monthRange(p.ate).end;
  const months = monthsBetween(p.de, p.ate);

  if (p.r === "saldo") {
    const { opening, moves } = await loadBalanceMoves(supabase, workspaceId, from, to, p.conta);
    return { kind: "saldo" as const, series: balanceSeries(opening, moves, from, to) };
  }
  const all = await loadReportTx(supabase, workspaceId, from, to, p.conta);
  // Mantém só o que cai no período pelo regime escolhido
  const inPeriod = all.filter((t) => {
    const d = p.base === "competencia" ? t.competence_date : t.status === "paid" && t.paid_date ? t.paid_date : t.due_date;
    return d >= from && d <= to;
  });
  if (p.r === "fluxo") return { kind: "fluxo" as const, rows: monthlyFlow(inPeriod, months, p.base) };
  if (p.r === "categorias") return { kind: "categorias" as const, rows: groupBy(inPeriod, p.tipo, p.dim) };
  if (p.r === "comparativo") return { kind: "comparativo" as const, months, rows: categoryByMonth(inPeriod, months, p.tipo, p.base) };
  return { kind: "dre" as const, rows: dre(inPeriod) };
}
