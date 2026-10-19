import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildTxQuery, type TxFilters, type TxRow } from "@/lib/transactions";
import { toCSV } from "@/lib/csv";
import { formatDateBR } from "@/lib/finance/dates";
import { TX_STATUS_LABEL, TX_TYPE_LABEL } from "@/lib/finance/labels";

export async function GET(request: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const supabase = await createClient();
  const filters = Object.fromEntries(request.nextUrl.searchParams) as TxFilters;
  const { query, month } = buildTxQuery(supabase, workspaceId, filters, { paginate: false });
  const { data, error } = await query.limit(10000);
  if (error) return NextResponse.json({ error: "Não foi possível exportar." }, { status: 400 });

  const rows = (data ?? []) as unknown as TxRow[];
  const csv = toCSV(
    ["Vencimento", "Competência", "Pagamento", "Tipo", "Descrição", "Categoria", "Contato", "Conta", "Status", "Valor"],
    rows.map((r) => [
      formatDateBR(r.due_date),
      formatDateBR(r.competence_date),
      formatDateBR(r.paid_date),
      TX_TYPE_LABEL[r.type],
      r.description,
      r.category?.name ?? "",
      r.contact?.name ?? "",
      r.account?.name ?? "",
      TX_STATUS_LABEL[r.status],
      ((r.direction * r.amount_cents) / 100).toFixed(2).replace(".", ","),
    ]),
  );
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lancamentos-${month}.csv"`,
    },
  });
}
