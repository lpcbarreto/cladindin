"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, firstIssue, formObject, getActionClient, optionalText, uuid, type FormState } from "@/lib/actions";
import { isValidCNPJ, isValidCPF, onlyDigits } from "@/lib/finance/document";

const schema = z.object({
  workspaceId: uuid,
  name: z.string().trim().min(1, "Informe o nome").max(120),
  document: z
    .string()
    .optional()
    .transform((v) => (v ? onlyDigits(v) : ""))
    .refine((d) => d === "" || isValidCPF(d) || isValidCNPJ(d), "CPF/CNPJ inválido")
    .transform((d) => d || null),
  email: optionalText.pipe(z.string().email("E-mail inválido").nullable()),
  phone: optionalText,
  isCustomer: z.string().optional(),
  isSupplier: z.string().optional(),
});

export async function createContact(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = schema.safeParse(formObject(form));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const v = parsed.data;
  const { supabase } = await getActionClient();
  const { error } = await supabase.from("contacts").insert({
    workspace_id: v.workspaceId,
    name: v.name,
    document: v.document,
    email: v.email,
    phone: v.phone,
    is_customer: v.isCustomer === "on",
    is_supplier: v.isSupplier === "on",
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/w/${v.workspaceId}/contatos`);
  return { ok: true, message: "Contato salvo." };
}

const delSchema = z.object({ workspaceId: uuid, id: uuid });

export async function deleteContact(form: FormData) {
  const v = delSchema.parse(formObject(form));
  const { supabase } = await getActionClient();
  await supabase.from("contacts").delete().eq("id", v.id).eq("workspace_id", v.workspaceId);
  revalidatePath(`/w/${v.workspaceId}/contatos`);
}
