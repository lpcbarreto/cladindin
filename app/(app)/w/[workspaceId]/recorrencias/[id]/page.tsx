import Link from "next/link";
import { notFound } from "next/navigation";
import { loadWorkspaceContext, hasRole } from "@/lib/workspace";
import { loadOptions } from "@/lib/transactions";
import { todayISO } from "@/lib/finance/dates";
import { RULE_COLUMNS, type RuleRow } from "@/lib/recurrence-server";
import { RuleForm } from "../rule-form";

export default async function EditRulePage({ params }: { params: Promise<{ workspaceId: string; id: string }> }) {
  const { workspaceId, id } = await params;
  const { supabase, current } = await loadWorkspaceContext(workspaceId);
  if (!hasRole(current.role, "editor")) notFound();
  const { data } = await supabase.from("recurrence_rules").select(RULE_COLUMNS).eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
  if (!data) notFound();
  const r = data as RuleRow;
  const options = await loadOptions(supabase, workspaceId);

  return (
    <div className="space-y-6">
      <Link href={`/w/${workspaceId}/recorrencias`} className="text-sm text-muted hover:underline">
        ← Recorrências
      </Link>
      <h1 className="text-3xl font-extrabold tracking-tight">Editar recorrência</h1>
      <div className="card">
        <RuleForm
          workspaceId={workspaceId}
          options={options}
          today={todayISO()}
          defaults={{
            id: r.id,
            type: r.type,
            accountId: r.account_id,
            toAccountId: r.to_account_id ?? "",
            description: r.description,
            amount: (r.amount_cents / 100).toFixed(2).replace(".", ","),
            variable: r.variable_amount,
            categoryId: r.category_id ?? "",
            contactId: r.contact_id ?? "",
            frequency: r.frequency,
            interval: r.interval_count,
            dayMode: r.day_mode,
            day: r.day,
            startDate: r.start_date,
            endMode: r.end_mode,
            untilDate: r.until_date ?? "",
            count: r.occurrence_count ? String(r.occurrence_count) : "",
            adjust: r.weekend_adjust,
          }}
        />
      </div>
    </div>
  );
}
