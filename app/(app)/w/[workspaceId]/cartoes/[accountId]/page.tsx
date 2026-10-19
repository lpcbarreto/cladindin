import Link from "next/link";
import { notFound } from "next/navigation";
import { loadWorkspaceContext, hasRole } from "@/lib/workspace";
import { formatBRL } from "@/lib/finance/money";
import { formatDateBR, todayISO } from "@/lib/finance/dates";
import { PayInvoiceForm } from "./pay-form";
import { CountUp } from "@/components/count-up";
import { undoInvoicePayment } from "../actions";
import { ConfirmButton } from "@/components/confirm-button";

type Line = {
  id: string;
  description: string;
  competence_date: string;
  direction: number;
  amount_cents: number;
  status: string;
  cardholder: string | null;
  installment_number: number | null;
  installment_total: number | null;
  category: { name: string } | null;
};

export default async function CardInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; accountId: string }>;
  searchParams: Promise<{ fatura?: string }>;
}) {
  const { workspaceId, accountId } = await params;
  const { fatura } = await searchParams;
  const { supabase, current } = await loadWorkspaceContext(workspaceId);
  const canEdit = hasRole(current.role, "editor");

  const { data: card } = await supabase
    .from("accounts")
    .select("id, name, credit_cards!credit_cards_account_id_fkey(closing_day, due_day, limit_cents, default_payment_account_id)")
    .eq("workspace_id", workspaceId)
    .eq("id", accountId)
    .eq("type", "credit_card")
    .maybeSingle();
  if (!card) notFound();
  const cc = (Array.isArray(card.credit_cards) ? card.credit_cards[0] : card.credit_cards) as {
    closing_day: number;
    due_day: number;
    limit_cents: number;
    default_payment_account_id: string | null;
  } | null;

  const { data: invoices } = await supabase
    .from("invoice_summaries")
    .select("id, period_start, closing_date, due_date, total_cents, declared_total_cents, status, paid_at, items")
    .eq("account_id", accountId)
    .order("due_date");
  const all = invoices ?? [];
  const today = todayISO();
  const current_ =
    all.find((i) => i.id === fatura) ?? all.find((i) => i.status !== "paid" && i.due_date >= today) ?? all[all.length - 1];
  const idx = current_ ? all.indexOf(current_) : -1;

  const [{ data: lines }, { data: payAccounts }] = await Promise.all([
    current_
      ? supabase
          .from("transactions")
          .select("id, description, competence_date, direction, amount_cents, status, cardholder, installment_number, installment_total, category:categories!category_id(name)")
          .eq("invoice_id", current_.id)
          .is("deleted_at", null)
          .neq("status", "cancelled")
          .order("competence_date")
      : Promise.resolve({ data: [] }),
    supabase.from("accounts").select("id, name").eq("workspace_id", workspaceId).eq("archived", false).neq("type", "credit_card").order("name"),
  ]);
  const rows = (lines ?? []) as unknown as Line[];
  const holders = [...new Set(rows.map((r) => r.cardholder).filter(Boolean))] as string[];
  const charges = rows.filter((r) => r.direction < 0).reduce((a, r) => a + r.amount_cents, 0);
  const credits = rows.filter((r) => r.direction > 0).reduce((a, r) => a + r.amount_cents, 0);
  const base = `/w/${workspaceId}/cartoes/${accountId}`;

  return (
    <div className="space-y-6">
      <Link href={`/w/${workspaceId}/cartoes`} className="text-sm text-muted hover:underline">
        ← Cartões
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-muted">
            Fecha dia {cc?.closing_day} · vence dia {cc?.due_day}
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight">{card.name}</h1>
        </div>
        {current_ && (
          <div className="flex items-center gap-2 text-sm">
            {idx > 0 ? (
              <Link className="btn-ghost px-3" href={`${base}?fatura=${all[idx - 1].id}`} aria-label="Fatura anterior">
                ‹
              </Link>
            ) : (
              <span className="btn-ghost px-3 opacity-40">‹</span>
            )}
            <span className="min-w-40 text-center font-semibold">Vence {formatDateBR(current_.due_date)}</span>
            {idx < all.length - 1 ? (
              <Link className="btn-ghost px-3" href={`${base}?fatura=${all[idx + 1].id}`} aria-label="Próxima fatura">
                ›
              </Link>
            ) : (
              <span className="btn-ghost px-3 opacity-40">›</span>
            )}
          </div>
        )}
      </div>

      {!current_ ? (
        <div className="card text-sm text-muted">
          Nenhuma fatura ainda. Lance compras neste cartão ou{" "}
          <Link className="text-primary underline" href={`/w/${workspaceId}/importar`}>
            importe a fatura
          </Link>
          .
        </div>
      ) : (
        <>
          <div className="stagger grid gap-4 md:grid-cols-3">
            <div className="rounded-[1.25rem] bg-primary p-5 text-primary-fg">
              <p className="text-sm font-semibold opacity-80">
                Total da fatura ·{" "}
                {current_.status === "paid" ? `paga em ${formatDateBR(current_.paid_at)}` : current_.status === "open" ? "aberta" : "fechada"}
              </p>
              <CountUp key={current_.id} cents={Number(current_.total_cents)} className="mt-1 block text-3xl font-extrabold tabular-nums" />
              <p className="mt-2 text-xs opacity-80">
                Período {formatDateBR(current_.period_start)} a {formatDateBR(current_.closing_date)}
              </p>
              {canEdit && current_.status === "paid" && (
                <form action={undoInvoicePayment} className="mt-3">
                  <input type="hidden" name="workspaceId" value={workspaceId} />
                  <input type="hidden" name="invoiceId" value={current_.id} />
                  <ConfirmButton
                    message="Desfazer o pagamento desta fatura? A transferência da conta para o cartão será removida."
                    className="rounded-full bg-primary-fg/15 px-3 py-1 text-xs font-semibold hover:bg-primary-fg/25"
                  >
                    Desfazer pagamento
                  </ConfirmButton>
                </form>
              )}
            </div>
            <div className="card space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Compras e encargos</span>
                <span className="tabular-nums">{formatBRL(charges)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Créditos e estornos</span>
                <span className="text-primary tabular-nums">-{formatBRL(credits)}</span>
              </div>
              {current_.declared_total_cents !== null && (
                <div className="flex justify-between border-t border-border pt-2">
                  <span className="text-muted">Total informado pelo banco</span>
                  <span className={`tabular-nums ${Number(current_.declared_total_cents) !== Number(current_.total_cents) ? "text-danger" : ""}`}>
                    {formatBRL(Number(current_.declared_total_cents))}
                  </span>
                </div>
              )}
            </div>
            {canEdit && current_.status !== "paid" && (
              <div className="card">
                <PayInvoiceForm
                  key={current_.id}
                  workspaceId={workspaceId}
                  invoiceId={current_.id}
                  total={Number(current_.total_cents)}
                  accounts={payAccounts ?? []}
                  defaultAccountId={cc?.default_payment_account_id ?? null}
                  defaultDate={current_.due_date}
                />
              </div>
            )}
          </div>

          {holders.length > 1 && (
            <div className="flex flex-wrap gap-2 text-sm">
              {holders.map((h) => (
                <span key={h} className="rounded-full bg-surface-2 px-3 py-1">
                  {h}:{" "}
                  <b className="tabular-nums">
                    {formatBRL(rows.filter((r) => r.cardholder === h).reduce((a, r) => a - r.direction * r.amount_cents, 0))}
                  </b>
                </span>
              ))}
            </div>
          )}

          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr className="border-b border-border">
                  <th className="p-3 font-normal">Compra</th>
                  <th className="p-3 font-normal">Descrição</th>
                  <th className="p-3 font-normal">Categoria</th>
                  <th className="p-3 text-right font-normal">Valor</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={`border-b border-border last:border-0 ${r.status === "planned" ? "text-muted" : ""}`}>
                    <td className="p-3 whitespace-nowrap tabular-nums">{formatDateBR(r.competence_date)}</td>
                    <td className="p-3">
                      {r.description}
                      <span className="mt-0.5 flex flex-wrap gap-1 text-xs">
                        {r.installment_number && (
                          <span className="rounded-full bg-accent-soft px-2 text-foreground">
                            {r.installment_number}/{r.installment_total}
                          </span>
                        )}
                        {r.status === "planned" && <span className="rounded-full bg-surface-2 px-2">prevista</span>}
                        {r.cardholder && <span className="text-muted">{r.cardholder}</span>}
                      </span>
                    </td>
                    <td className="p-3 text-muted">{r.category?.name ?? "—"}</td>
                    <td className={`p-3 text-right font-semibold whitespace-nowrap tabular-nums ${r.direction > 0 ? "text-primary" : ""}`}>
                      {formatBRL(-r.direction * r.amount_cents)}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-muted">
                      Nenhum lançamento nesta fatura.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
