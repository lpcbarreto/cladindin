import Link from "next/link";
import { loadWorkspaceContext, hasRole } from "@/lib/workspace";
import { loadOptions } from "@/lib/transactions";
import { formatBRL } from "@/lib/finance/money";
import { addDays, formatDateBR, todayISO } from "@/lib/finance/dates";
import { describeRule, occurrences } from "@/lib/finance/recurrence";
import { detectRecurring, type HistoryTx } from "@/lib/finance/recurrence-detect";
import { normalizeDescription } from "@/lib/importers/normalize";
import { RULE_COLUMNS, toRule, topUpWorkspace, type RuleRow } from "@/lib/recurrence-server";
import { ConfirmButton } from "@/components/confirm-button";
import { changeRuleStatus } from "./actions";
import { RuleForm, type RuleDefaults } from "./rule-form";

const STATUS = { active: ["Ativa", "bg-primary-soft text-primary"], paused: ["Pausada", "bg-accent-soft"], ended: ["Encerrada", "bg-surface-2 text-muted"] } as const;

export default async function RecurrencesPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { workspaceId } = await params;
  const sp = await searchParams;
  const { supabase, current } = await loadWorkspaceContext(workspaceId);
  const canEdit = hasRole(current.role, "editor");
  const today = todayISO();
  if (canEdit) await topUpWorkspace(supabase, workspaceId, today);

  const [options, { data: rulesData }, { data: history }] = await Promise.all([
    loadOptions(supabase, workspaceId),
    supabase.from("recurrence_rules").select(RULE_COLUMNS).eq("workspace_id", workspaceId).order("status").order("description"),
    supabase
      .from("transactions")
      .select("account_id, description, statement_description, direction, amount_cents, competence_date, category_id")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .is("recurrence_id", null)
      .is("installment_group_id", null)
      .in("type", ["income", "expense"])
      .eq("status", "paid")
      .gte("competence_date", addDays(today, -200))
      .limit(5000),
  ]);
  const rules = (rulesData ?? []) as RuleRow[];
  const accountName = new Map(options.accounts.map((a) => [a.id, a.name]));

  const known = new Set(rules.map((r) => normalizeDescription(r.description)));
  const suggestions = detectRecurring(
    (history ?? []).map(
      (t): HistoryTx => ({
        accountId: t.account_id,
        description: t.statement_description || t.description,
        amountCents: t.direction * t.amount_cents,
        date: t.competence_date,
        categoryId: t.category_id,
      }),
    ),
    known,
  ).slice(0, 6);

  const defaults: RuleDefaults = {
    type: (sp.tipo as RuleDefaults["type"]) ?? "expense",
    accountId: sp.conta ?? options.accounts[0]?.id ?? "",
    toAccountId: "",
    description: sp.desc ?? "",
    amount: sp.valor ?? "",
    variable: sp.var === "1",
    categoryId: sp.cat ?? "",
    contactId: "",
    frequency: "monthly",
    interval: 1,
    dayMode: "fixed",
    day: Number(sp.dia) || Number(today.slice(8, 10)),
    startDate: today,
    endMode: "never",
    untilDate: "",
    count: "",
    adjust: "none",
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Recorrências</h1>

      {canEdit && suggestions.length > 0 && (
        <section className="card space-y-3">
          <h2 className="font-bold">Parece recorrente</h2>
          <p className="text-sm text-muted">Encontramos cobranças que se repetem todo mês. Crie a regra com um clique para prever os próximos meses.</p>
          <ul className="grid gap-2 md:grid-cols-2">
            {suggestions.map((s) => {
              const q = new URLSearchParams({
                nova: "1",
                tipo: s.type,
                conta: s.accountId,
                desc: s.description.slice(0, 120),
                valor: (s.amountCents / 100).toFixed(2).replace(".", ","),
                dia: String(s.day),
                ...(s.variable ? { var: "1" } : {}),
                ...(s.categoryId ? { cat: s.categoryId } : {}),
              });
              return (
                <li key={`${s.accountId}-${s.key}`} className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 p-3 text-sm">
                  <span className="min-w-0">
                    <b className="block truncate">{s.description}</b>
                    <span className="text-muted">
                      Mensal, ~dia {s.day} · {s.variable ? "~" : ""}
                      {formatBRL(s.amountCents)} · {s.months} meses · {accountName.get(s.accountId)}
                    </span>
                  </span>
                  <Link href={`?${q}#nova`} className="btn-ghost shrink-0 py-1">
                    Criar regra
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {canEdit && (
        <details id="nova" className="card" open={sp.nova === "1" || rules.length === 0}>
          <summary className="cursor-pointer font-bold">Nova recorrência</summary>
          <div className="mt-4">
            <RuleForm key={JSON.stringify(sp)} workspaceId={workspaceId} options={options} defaults={defaults} today={today} />
          </div>
        </details>
      )}

      <div className="space-y-3">
        {rules.map((r) => {
          const next = r.status === "active" ? occurrences(toRule(r), today, addDays(today, 800), 3) : [];
          const [label, cls] = STATUS[r.status];
          const signed = r.type === "income" ? r.amount_cents : -r.amount_cents;
          return (
            <div key={r.id} className={`card flex flex-wrap items-center justify-between gap-4 ${r.status !== "active" ? "opacity-70" : ""}`}>
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-center gap-2 font-bold">
                  {r.description}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>
                </p>
                <p className="text-sm text-muted">
                  {describeRule(toRule(r))} · {accountName.get(r.account_id) ?? "conta arquivada"}
                  {r.to_account_id && ` → ${accountName.get(r.to_account_id) ?? ""}`}
                  {r.end_mode === "until" && r.until_date && ` · até ${formatDateBR(r.until_date)}`}
                  {r.end_mode === "count" && ` · ${r.occurrence_count} vezes`}
                </p>
                {next.length > 0 && <p className="text-xs text-muted">Próximas: {next.map((o) => formatDateBR(o.date)).join(", ")}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className={`text-lg font-extrabold tabular-nums ${r.type === "transfer" ? "text-muted" : signed < 0 ? "text-danger" : "text-primary"}`}>
                  {r.variable_amount && "~"}
                  {formatBRL(r.type === "transfer" ? r.amount_cents : signed)}
                </span>
                {canEdit && (
                  <div className="flex flex-wrap gap-1">
                    <Link href={`/w/${workspaceId}/recorrencias/${r.id}`} className="btn-ghost px-3 py-1 text-xs">
                      Editar
                    </Link>
                    {r.status === "active" && <StatusButton workspaceId={workspaceId} id={r.id} op="pause" label="Pausar" />}
                    {r.status === "paused" && <StatusButton workspaceId={workspaceId} id={r.id} op="resume" label="Reativar" />}
                    {r.status === "active" && (
                      <StatusButton workspaceId={workspaceId} id={r.id} op="end" label="Encerrar" confirm="Encerrar hoje? Os previstos futuros serão removidos." />
                    )}
                    <StatusButton
                      workspaceId={workspaceId}
                      id={r.id}
                      op="delete"
                      label="Excluir"
                      danger
                      confirm="Excluir a regra? Previstos futuros são removidos; lançamentos já pagos são mantidos."
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {rules.length === 0 && <p className="text-sm text-muted">Nenhuma recorrência cadastrada ainda.</p>}
      </div>
    </div>
  );
}

function StatusButton({
  workspaceId,
  id,
  op,
  label,
  confirm,
  danger,
}: {
  workspaceId: string;
  id: string;
  op: string;
  label: string;
  confirm?: string;
  danger?: boolean;
}) {
  const cls = `btn-ghost px-3 py-1 text-xs ${danger ? "text-danger" : ""}`;
  return (
    <form action={changeRuleStatus}>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value={op} />
      {confirm ? (
        <ConfirmButton message={confirm} className={cls}>
          {label}
        </ConfirmButton>
      ) : (
        <button className={cls}>{label}</button>
      )}
    </form>
  );
}
