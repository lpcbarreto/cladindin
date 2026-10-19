"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, formObject, getActionClient, uuid, type FormState } from "@/lib/actions";
import { parseMoneyToCents } from "@/lib/finance/money";

const schema = z.object({
  workspaceId: uuid,
  categoryId: uuid,
  month: z.string().regex(/^\d{4}-\d{2}$/),
  scope: z.enum(["default", "month"]),
  amount: z.string().optional(),
});

/** Define (ou remove, se vazio) o orçamento: padrão para todos os meses ou só para o mês. */
export async function saveBudget(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = schema.safeParse(formObject(form));
  if (!parsed.success) return { ok: false, message: "Dados inválidos." };
  const v = parsed.data;
  let cents: number | null = null;
  if (v.amount?.trim()) {
    try {
      cents = Math.abs(parseMoneyToCents(v.amount));
    } catch {
      return { ok: false, message: "Valor inválido." };
    }
  }
  const { supabase } = await getActionClient();
  const month = v.scope === "month" ? `${v.month}-01` : null;
  const del = supabase.from("budgets").delete().eq("workspace_id", v.workspaceId).eq("category_id", v.categoryId);
  await (month ? del.eq("month", month) : del.is("month", null));
  if (cents) {
    const { error } = await supabase
      .from("budgets")
      .insert({ workspace_id: v.workspaceId, category_id: v.categoryId, month, amount_cents: cents });
    if (error) return { ok: false, message: dbErrorMessage(error) };
  }
  revalidatePath(`/w/${v.workspaceId}`, "layout");
  return { ok: true, message: cents ? "Salvo." : "Removido." };
}
