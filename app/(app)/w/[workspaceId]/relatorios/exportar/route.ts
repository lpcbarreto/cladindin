import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toCSV } from "@/lib/csv";
import { formatDateBR } from "@/lib/finance/dates";
import { buildReport, parseReportParams } from "@/lib/report-data";

const money = (c: number) => (c / 100).toFixed(2).replace(".", ",");

export async function GET(request: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const supabase = await createClient();
  const p = parseReportParams(Object.fromEntries(request.nextUrl.searchParams));
  let report;
  try {
    report = await buildReport(supabase, workspaceId, p);
  } catch {
    return NextResponse.json({ error: "Não foi possível exportar." }, { status: 400 });
  }

  let csv: string;
  if (report.kind === "fluxo") {
    csv = toCSV(
      ["Mês", "Receitas", "Despesas", "Resultado", "Receitas previstas", "Despesas previstas", "Resultado previsto"],
      report.rows.map((r) => [r.month, money(r.income), money(r.expense), money(r.net), money(r.incomePlanned), money(r.expensePlanned), money(r.netPlanned)]),
    );
  } else if (report.kind === "categorias") {
    csv = toCSV(
      ["Grupo", "Subgrupo", "Total", "%"],
      report.rows.flatMap((r) => [
        [r.name, "", money(r.total), (r.share * 100).toFixed(1).replace(".", ",")],
        ...r.children.map((c) => [r.name, c.name, money(c.total), ""]),
      ]),
    );
  } else if (report.kind === "comparativo") {
    csv = toCSV(["Categoria", ...report.months, "Total"], report.rows.map((r) => [r.name, ...r.values.map(money), money(r.total)]));
  } else if (report.kind === "dre") {
    csv = toCSV(["Linha", "Valor"], report.rows.map((r) => [r.label, money(r.value)]));
  } else {
    csv = toCSV(["Data", "Saldo"], report.series.map((r) => [formatDateBR(r.date), money(r.balance)]));
  }
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="relatorio-${p.r}-${p.de}-a-${p.ate}.csv"`,
    },
  });
}
