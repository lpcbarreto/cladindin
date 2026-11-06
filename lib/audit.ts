import { formatBRL } from "@/lib/finance/money";
import { formatDateBR } from "@/lib/finance/dates";

export type AuditRow = {
  table_name: string;
  action: "insert" | "update" | "delete";
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
};

const STATUS: Record<string, string> = { paid: "pago", planned: "previsto", cancelled: "cancelado" };
const ROLE: Record<string, string> = { owner: "proprietário", admin: "administrador", editor: "editor", viewer: "leitor" };
const money = (v: unknown) => formatBRL(Number(v ?? 0));
const q = (v: unknown) => `“${String(v ?? "")}”`;

/** Frase curta, do ponto de vista de quem lê, para uma linha do registro de alterações. Null = não mostrar. */
export function describeAudit(r: AuditRow): string | null {
  const n = r.new_data ?? {};
  const o = r.old_data ?? {};
  if (r.table_name === "transactions") {
    const name = q(n.description ?? o.description);
    if (r.action === "insert") return `criou ${name} (${money(n.amount_cents)})`;
    if (r.action === "delete") return `apagou definitivamente ${name}`;
    if (!o.deleted_at && n.deleted_at) return `excluiu ${name}`;
    if (o.deleted_at && !n.deleted_at) return `restaurou ${name}`;
    const parts: string[] = [];
    if (o.approval !== n.approval) {
      if (n.approval === "approved") return `aprovou ${name}`;
      if (n.approval === "rejected") return `recusou ${name}`;
      if (n.approval === "pending") parts.push("enviou para aprovação");
    }
    if (o.amount_cents !== n.amount_cents) parts.push(`mudou o valor de ${money(o.amount_cents)} para ${money(n.amount_cents)}`);
    if (o.status !== n.status) {
      if (n.status === "paid" && n.reconciled && !o.reconciled) parts.push("conciliou com o extrato");
      else parts.push(`marcou como ${STATUS[String(n.status)] ?? n.status}`);
    }
    if (o.due_date !== n.due_date) parts.push(`mudou o vencimento para ${formatDateBR(String(n.due_date))}`);
    if (o.description !== n.description) parts.push(`renomeou de ${q(o.description)}`);
    if (o.category_id !== n.category_id) parts.push("trocou a categoria");
    if (o.cost_center_id !== n.cost_center_id) parts.push("trocou o centro de custo");
    if (!parts.length) return null;
    return `${parts.join(", ")} em ${name}`;
  }
  if (r.table_name === "accounts") {
    const name = q(n.name ?? o.name);
    if (r.action === "insert") return `criou a conta ${name}`;
    if (r.action === "delete") return `excluiu a conta ${name}`;
    if (o.archived !== n.archived) return `${n.archived ? "arquivou" : "reativou"} a conta ${name}`;
    if (o.name !== n.name) return `renomeou a conta ${q(o.name)} para ${name}`;
    return null;
  }
  if (r.table_name === "workspace_members") {
    if (r.action === "insert") return `entrou no espaço como ${ROLE[String(n.role)] ?? n.role}`;
    if (r.action === "delete") return "removeu um membro";
    if (o.role !== n.role) return `mudou um papel para ${ROLE[String(n.role)] ?? n.role}`;
    return null;
  }
  if (r.table_name === "recurrence_rules") {
    const name = q(n.description ?? o.description);
    if (r.action === "insert") return `criou a recorrência ${name}`;
    if (r.action === "delete") return `excluiu a recorrência ${name}`;
    return `alterou a recorrência ${name}`;
  }
  return null;
}
