import Link from "next/link";
import { loadWorkspaceContext, hasRole } from "@/lib/workspace";
import { formatBRL } from "@/lib/finance/money";
import { addDays, formatDateBR, todayISO } from "@/lib/finance/dates";
import { topUpWorkspace } from "@/lib/recurrence-server";
import { settleMany } from "./actions";
import { SettleForm } from "./settle-form";

type Row = {
  id: string;
  type: "income" | "expense" | "transfer";
  direction: number;
  amount_cents: number;
  description: string;
  due_date: string;
  account_id: string;
  origin: string;
  recurrence_id: string | null;
  installment_number: number | null;
  installment_total: number | null;
  notes: string | null;
  account: { name: string } | null;
  contact: { name: string } | null;
};

const GROUPS = [
  { key: "atrasados", label: "Atrasados", tone: "text-danger" },
  { key: "hoje", label: "Vencem hoje", tone: "text-foreground" },
  { key: "semana", label: "Próximos 7 dias", tone: "text-foreground" },
  { key: "mes", label: "Próximos 30 dias", tone: "text-foreground" },
  { key: "depois", label: "Depois", tone: "text-muted" },
] as const;

export default async function PayablesPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ tipo?: string; ate?: string }>;
}) {
  const { workspaceId } = await params;
  const { tipo, ate } = await searchParams;
  const mode = tipo === "receber" ? "receber" : "pagar";
  const { supabase, current } = await loadWorkspaceContext(workspaceId);
  const canEdit = hasRole(current.role, "editor");
  const today = todayISO();
  if (canEdit) await topUpWorkspace(supabase, workspaceId, today);
  const until = ate === "90" ? addDays(today, 90) : ate === "365" ? addDays(today, 365) : addDays(today, 60);

  const [{ data }, { data: invoices }, { data: accounts }] = await Promise.all([
    supabase
      .from("transactions")
      .select(
        "id, type, direction, amount_cents, description, due_date, account_id, origin, recurrence_id, installment_number, installment_total, notes, account:accounts!account_id(name), contact:contacts!contact_id(name)",
      )
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .eq("status", "planned")
      .is("invoice_id", null)
      .eq("type", mode === "pagar" ? "expense" : "income")
      .lte("due_date", until)
      .order("due_date")
      .limit(1000),
    mode === "pagar"
      ? supabase
          .from("invoice_summaries")
          .select("id, account_id, due_date, total_cents")
          .eq("workspace_id", workspaceId)
          .is("paid_at", null)
          .lte("due_date", until)
          .gt("total_cents", 0)
          .order("due_date")
      : Promise.resolve({ data: [] }),
    supabase.from("accounts").select("id, name, type").eq("workspace_id", workspaceId).eq("archived", false).order("name"),
  ]);
  const rows = (data ?? []) as unknown as Row[];
  const accountName = new Map((accounts ?? []).map((a) => [a.id, a.name]));
  const payAccounts = (accounts ?? []).filter((a) => a.type !== "credit_card");

  const groupOf = (d: string) =>
    d < today ? "atrasados" : d === today ? "hoje" : d <= addDays(today, 7) ? "semana" : d <= addDays(today, 30) ? "mes" : "depois";
  const total = (list: { amount_cents: number }[]) => list.reduce((a, r) => a + r.amount_cents, 0);
  const base = `/w/${workspaceId}/a-pagar`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight">Contas a {mode}</h1>
        <div className="flex gap-1 rounded-full bg-surface-2 p-1 text-sm font-semibold">
          {(["pagar", "receber"] as const).map((m) => (
            <Link
              key={m}
              href={`${base}?tipo=${m}`}
              className={`rounded-full px-4 py-1.5 ${mode === m ? "bg-surface shadow-sm" : "text-muted hover:text-foreground"}`}
            >
              A {m}
            </Link>
          ))}
        </div>
      </div>

      <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {GROUPS.map((g) => {
          const list = rows.filter((r) => groupOf(r.due_date) === g.key);
          const inv = (invoices ?? []).filter((i) => groupOf(i.due_date) === g.key);
          const sum = total(list) + inv.reduce((a, i) => a + Number(i.total_cents), 0);
          return (
            <a key={g.key} href={`#${g.key}`} className={`card lift p-4 ${g.key === "atrasados" && sum > 0 ? "border-danger/40 bg-danger-soft" : ""}`}>
              <p className="text-xs font-semibold text-muted">{g.label}</p>
              <p className={`text-xl font-extrabold tabular-nums ${g.key === "atrasados" && sum > 0 ? "text-danger" : ""}`}>{formatBRL(sum)}</p>
              <p className="text-xs text-muted">{list.length + inv.length} item(ns)</p>
            </a>
          );
        })}
      </div>

      {(invoices ?? []).length > 0 && (
        <section className="card space-y-2">
          <h2 className="font-bold">Faturas de cartão</h2>
          <ul className="divide-y divide-border text-sm">
            {(invoices ?? []).map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  <b>{accountName.get(i.account_id)}</b> · vence {formatDateBR(i.due_date)}
                  {i.due_date < today && <span className="ml-2 rounded-full bg-danger-soft px-2 text-xs font-semibold text-danger">atrasada</span>}
                </span>
                <span className="flex items-center gap-3">
                  <b className="tabular-nums">{formatBRL(Number(i.total_cents))}</b>
                  <Link href={`/w/${workspaceId}/cartoes/${i.account_id}?fatura=${i.id}`} className="btn-ghost py-1 text-xs">
                    Pagar fatura
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {canEdit && rows.length > 0 && (
        <form id="baixa-em-massa" action={settleMany} className="flex flex-wrap items-center gap-2 text-sm">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <span className="text-muted">Selecionados:</span>
          <input type="date" name="paidDate" defaultValue={today} className="input w-44 py-1" aria-label="Data da baixa" />
          <button className="btn py-1.5">{mode === "pagar" ? "Marcar como pagos" : "Marcar como recebidos"}</button>
          <span className="text-xs text-muted">pelo valor integral</span>
        </form>
      )}

      <div className="space-y-4">

        {GROUPS.map((g) => {
          const list = rows.filter((r) => groupOf(r.due_date) === g.key);
          if (!list.length) return null;
          return (
            <section key={g.key} id={g.key} className="card space-y-2 p-0">
              <header className="flex items-center justify-between px-5 pt-4">
                <h2 className={`font-bold ${g.tone}`}>{g.label}</h2>
                <span className="text-sm font-semibold tabular-nums">{formatBRL(total(list))}</span>
              </header>
              <ul className="divide-y divide-border">
                {list.map((r) => (
                  <li key={r.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      {canEdit && <input type="checkbox" form="baixa-em-massa" name="ids" value={r.id} aria-label={`Selecionar ${r.description}`} />}
                      <span className={`w-20 text-sm tabular-nums ${r.due_date < today ? "font-bold text-danger" : "text-muted"}`}>
                        {formatDateBR(r.due_date)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <Link href={`/w/${workspaceId}/lancamentos/${r.id}`} className="font-semibold hover:underline">
                          {r.description}
                        </Link>
                        <span className="flex flex-wrap gap-1 text-xs text-muted">
                          {r.account?.name}
                          {r.contact && <> · {r.contact.name}</>}
                          {r.recurrence_id && <span className="rounded-full bg-primary-soft px-2 text-primary">recorrente</span>}
                          {r.installment_number && (
                            <span className="rounded-full bg-accent-soft px-2 text-foreground">
                              {r.installment_number}/{r.installment_total}
                            </span>
                          )}
                          {r.notes?.includes("estimado") && <span className="rounded-full bg-surface-2 px-2">valor estimado</span>}
                        </span>
                      </span>
                      <b className="tabular-nums">{formatBRL(r.amount_cents)}</b>
                    </div>
                    {canEdit && (
                      <details className="mt-2 ml-7">
                        <summary className="cursor-pointer text-xs font-semibold text-primary">
                          {mode === "pagar" ? "Pagar" : "Receber"} (total, parcial, juros, desconto, comprovante)
                        </summary>
                        <div className="mt-3">
                          <SettleForm
                            workspaceId={workspaceId}
                            id={r.id}
                            amountCents={r.amount_cents}
                            accountId={r.account_id}
                            accounts={payAccounts}
                            today={today}
                            kind={r.type === "income" ? "income" : "expense"}
                          />
                        </div>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {rows.length === 0 && (invoices ?? []).length === 0 && (
          <div className="card text-center text-sm text-muted">Nada a {mode} no período. 🎉</div>
        )}
      </div>

      <p className="text-xs text-muted">
        Mostrando até {formatDateBR(until)} ·{" "}
        <Link href={`${base}?tipo=${mode}&ate=90`} className="underline">
          90 dias
        </Link>{" "}
        ·{" "}
        <Link href={`${base}?tipo=${mode}&ate=365`} className="underline">
          12 meses
        </Link>
        . Compras de cartão aparecem aqui pela fatura.
      </p>
    </div>
  );
}
