"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, firstIssue, formObject, getActionClient, isoDate, uuid, type FormState } from "@/lib/actions";
import { parseMoneyToCents } from "@/lib/finance/money";

const paySchema = z.object({
  workspaceId: uuid,
  invoiceId: uuid,
  fromAccountId: uuid,
  date: isoDate,
  amount: z.string().transform((v, ctx) => {
    try {
      const c = Math.abs(parseMoneyToCents(v));
      if (!c) throw new Error();
      return c;
    } catch {
      ctx.addIssue({ code: "custom", message: "Informe o valor pago" });
      return z.NEVER;
    }
  }),
});

/** Registra o pagamento da fatura como transferência conta → cartão (nunca como despesa). */
export async function payInvoice(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = paySchema.safeParse(formObject(form));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const v = parsed.data;
  const { supabase } = await getActionClient();
  const { error } = await supabase.rpc("pay_invoice", {
    p_invoice_id: v.invoiceId,
    p_from_account: v.fromAccountId,
    p_amount_cents: v.amount,
    p_date: v.date,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/w/${v.workspaceId}`, "layout");
  return { ok: true, message: "Pagamento registrado." };
}

/** Remove a transferência do pagamento e reabre a fatura. */
export async function undoInvoicePayment(form: FormData) {
  const v = z.object({ workspaceId: uuid, invoiceId: uuid }).parse(formObject(form));
  const { supabase } = await getActionClient();
  const { data: inv } = await supabase
    .from("invoices")
    .select("payment_transfer_group_id")
    .eq("id", v.invoiceId)
    .eq("workspace_id", v.workspaceId)
    .maybeSingle();
  if (!inv) return;
  if (inv.payment_transfer_group_id) {
    await supabase
      .from("transactions")
      .update({ deleted_at: new Date().toISOString() })
      .eq("workspace_id", v.workspaceId)
      .eq("transfer_group_id", inv.payment_transfer_group_id);
  }
  await supabase.from("invoices").update({ paid_at: null, payment_transfer_group_id: null }).eq("id", v.invoiceId);
  revalidatePath(`/w/${v.workspaceId}`, "layout");
}
