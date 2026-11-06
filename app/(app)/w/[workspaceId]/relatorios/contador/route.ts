import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toCSV } from "@/lib/csv";
import { formatDateBR, monthRange, todayISO } from "@/lib/finance/dates";
import { dre } from "@/lib/finance/reports";
import { loadReportTx } from "@/lib/reports-server";

const money = (c: number) => (c / 100).toFixed(2).replace(".", ",");
const STATUS: Record<string, string> = { paid: "Pago", planned: "Em aberto", cancelled: "Cancelado" };

/**
 * Pacote do contador: uma planilha (abre no Excel) com todos os lançamentos do mês pela competência,
 * com categoria, centro de custo, cliente/fornecedor e se tem comprovante, seguida da DRE do mês.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const mes = request.nextUrl.searchParams.get("mes") ?? "";
  const month = /^\d{4}-\d{2}$/.test(mes) ? mes : todayISO().slice(0, 7);
  const { start, end } = monthRange(month);
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) return NextResponse.json({ error: "Entre na sua conta." }, { status: 401 });

  const { data: txs, error } = await supabase
    .from("transactions")
    .select(
      "competence_date, due_date, paid_date, status, type, direction, amount_cents, description, notes, account:accounts(name), category:categories!category_id(name, parent:parent_id(name)), contact:contacts!contact_id(name, document), cost_center:cost_centers!cost_center_id(name), attachments(count)",
    )
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .in("type", ["income", "expense"])
    .gte("competence_date", start)
    .lte("competence_date", end)
    .order("competence_date")
    .limit(5000);
  if (error) return NextResponse.json({ error: "Não foi possível gerar o pacote." }, { status: 400 });

  type Row = {
    competence_date: string;
    due_date: string;
    paid_date: string | null;
    status: string;
    type: string;
    direction: number;
    amount_cents: number;
    description: string;
    notes: string | null;
    account: { name: string } | null;
    category: { name: string; parent: { name: string } | null } | null;
    contact: { name: string; document: string | null } | null;
    cost_center: { name: string } | null;
    attachments: { count: number }[];
  };
  const rows = (txs ?? []) as unknown as Row[];
  const part1 = toCSV(
    ["Competência", "Vencimento", "Pagamento", "Situação", "Tipo", "Valor", "Descrição", "Categoria", "Subcategoria", "Centro de custo", "Cliente/fornecedor", "CPF/CNPJ", "Conta", "Comprovantes", "Observações"],
    rows.map((t) => [
      formatDateBR(t.competence_date),
      formatDateBR(t.due_date),
      t.paid_date ? formatDateBR(t.paid_date) : "",
      STATUS[t.status] ?? t.status,
      t.type === "income" ? "Receita" : "Despesa",
      money(t.direction * t.amount_cents),
      t.description,
      t.category?.parent?.name ?? t.category?.name ?? "",
      t.category?.parent ? t.category.name : "",
      t.cost_center?.name ?? "",
      t.contact?.name ?? "",
      t.contact?.document ?? "",
      t.account?.name ?? "",
      t.attachments?.[0]?.count ?? 0,
      t.notes ?? "",
    ]),
  );

  const all = await loadReportTx(supabase, workspaceId, start, end);
  const lines = dre(all.filter((t) => t.competence_date >= start && t.competence_date <= end));
  const part2 = toCSV(["DRE do mês (só pagos)", "Valor"], lines.map((l) => [l.label, money(l.value)])).replace(/^﻿/, "");

  return new NextResponse(`${part1}\r\n\r\n${part2}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contador-${month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
