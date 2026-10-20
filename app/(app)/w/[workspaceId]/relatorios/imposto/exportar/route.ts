import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toCSV } from "@/lib/csv";
import { formatDocument } from "@/lib/finance/document";
import { loadTaxReport } from "@/lib/tax-report";

const money = (c: number) => (c / 100).toFixed(2).replace(".", ",");

export async function GET(request: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const year = Number(request.nextUrl.searchParams.get("ano")) || new Date().getFullYear() - 1;
  const supabase = await createClient();
  let r;
  try {
    r = await loadTaxReport(supabase, workspaceId, year);
  } catch {
    return NextResponse.json({ error: "Não foi possível exportar." }, { status: 400 });
  }
  const csv = toCSV(
    ["Seção", "Item", "CPF/CNPJ", "Recebido", "Pago"],
    [
      ...r.incomeByCategory.map((i) => ["Rendimentos", i.name, "", money(i.total), ""]),
      ...r.deductible.map((d) => ["Despesas possivelmente dedutíveis", d.name, "", "", money(d.total)]),
      ...r.contacts.map((c) => ["Por CPF/CNPJ", c.name, formatDocument(c.document), money(c.income), money(c.expense)]),
    ],
  );
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="imposto-de-renda-${year}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
