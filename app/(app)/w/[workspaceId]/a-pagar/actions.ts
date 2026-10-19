"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, getActionClient, isoDate, uuid, type FormState } from "@/lib/actions";
import { parseMoneyToCents } from "@/lib/finance/money";
import { saveAttachment } from "@/lib/attachments";

const money = (label: string, required = false) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v?.trim()) {
        if (required) ctx.addIssue({ code: "custom", message: `Informe ${label}` });
        return 0;
      }
      try {
        return Math.abs(parseMoneyToCents(v));
      } catch {
        ctx.addIssue({ code: "custom", message: `${label} inválido` });
        return z.NEVER;
      }
    });

const settleSchema = z.object({
  workspaceId: uuid,
  id: uuid,
  accountId: uuid,
  paidDate: isoDate,
  principal: money("o valor pago", true),
  interest: money("Juros"),
  fine: money("Multa"),
  discount: money("Desconto"),
});

/** Baixa individual: total ou parcial, com juros, multa, desconto e comprovante opcional. */
export async function settleTransaction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = settleSchema.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const v = parsed.data;
  const { supabase } = await getActionClient();

  const { data, error } = await supabase.rpc("settle_transaction", {
    p_id: v.id,
    p_paid_date: v.paidDate,
    p_principal_cents: v.principal,
    p_interest_cents: v.interest,
    p_fine_cents: v.fine,
    p_discount_cents: v.discount,
    p_account_id: v.accountId,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };

  let attachMsg = "";
  const file = form.get("receipt");
  if (file instanceof File && file.size > 0) {
    const res = await saveAttachment(supabase, v.workspaceId, v.id, file);
    attachMsg = res.ok ? " Comprovante anexado." : ` Baixa feita, mas o comprovante falhou: ${res.message}`;
  }
  revalidatePath(`/w/${v.workspaceId}`, "layout");
  const remaining = (data as { remaining_cents: number }).remaining_cents;
  return {
    ok: true,
    message: (remaining > 0 ? "Baixa parcial registrada; o saldo ficou previsto." : "Baixa registrada.") + attachMsg,
  };
}

const bulkSchema = z.object({ workspaceId: uuid, paidDate: isoDate, ids: z.array(uuid).min(1).max(500) });

/** Baixa em massa pelo valor integral na data escolhida (transferências baixam o par). */
export async function settleMany(form: FormData) {
  const parsed = bulkSchema.safeParse({ ...Object.fromEntries(form), ids: form.getAll("ids") });
  if (!parsed.success) return;
  const v = parsed.data;
  const { supabase } = await getActionClient();
  const { data: rows } = await supabase
    .from("transactions")
    .select("id, amount_cents, type, transfer_group_id")
    .eq("workspace_id", v.workspaceId)
    .eq("status", "planned")
    .in("id", v.ids);
  for (const r of rows ?? []) {
    if (r.type === "transfer") {
      await supabase
        .from("transactions")
        .update({ status: "paid", paid_date: v.paidDate })
        .eq("workspace_id", v.workspaceId)
        .eq("transfer_group_id", r.transfer_group_id);
    } else {
      await supabase.rpc("settle_transaction", { p_id: r.id, p_paid_date: v.paidDate, p_principal_cents: r.amount_cents });
    }
  }
  revalidatePath(`/w/${v.workspaceId}`, "layout");
}

const attachSchema = z.object({ workspaceId: uuid, id: uuid });

export async function addAttachment(_prev: FormState, form: FormData): Promise<FormState> {
  const v = attachSchema.safeParse({ workspaceId: form.get("workspaceId"), id: form.get("id") });
  const file = form.get("receipt");
  if (!v.success || !(file instanceof File) || file.size === 0) return { ok: false, message: "Escolha um arquivo." };
  const { supabase } = await getActionClient();
  const res = await saveAttachment(supabase, v.data.workspaceId, v.data.id, file);
  revalidatePath(`/w/${v.data.workspaceId}/lancamentos/${v.data.id}`);
  return res.ok ? { ok: true, message: "Comprovante anexado." } : { ok: false, message: res.message };
}

export async function removeAttachment(form: FormData) {
  const v = z.object({ workspaceId: uuid, attachmentId: uuid, id: uuid }).parse(Object.fromEntries(form));
  const { supabase } = await getActionClient();
  const { data } = await supabase.from("attachments").select("storage_path").eq("id", v.attachmentId).maybeSingle();
  if (data) {
    await supabase.storage.from("comprovantes").remove([data.storage_path]);
    await supabase.from("attachments").delete().eq("id", v.attachmentId);
  }
  revalidatePath(`/w/${v.workspaceId}/lancamentos/${v.id}`);
}
