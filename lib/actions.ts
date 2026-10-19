import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type FormState = { ok: boolean; message: string } | null;

export const uuid = z.string().uuid();
export const optionalUuid = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.string().uuid().nullable());
export const optionalText = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? v.trim() : null));
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");

/** Lê FormData como objeto simples (checkboxes ausentes ficam undefined). */
export function formObject(form: FormData) {
  return Object.fromEntries([...form.entries()].filter(([k]) => !k.startsWith("$ACTION")));
}

export function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message ?? "Dados inválidos";
}

/** Mensagem amigável para erros do Postgres/RLS, sem vazar detalhes internos. */
export function dbErrorMessage(error: { code?: string; message?: string } | null): string {
  if (!error) return "Erro desconhecido.";
  if (error.code === "42501") return "Você não tem permissão para esta ação.";
  if (error.code === "23505") return "Já existe um registro com esses dados.";
  if (error.code === "23503") return "Este registro está em uso e não pode ser removido.";
  if (error.code === "P0001" && error.message) return error.message;
  return "Não foi possível salvar. Tente novamente.";
}

export async function getActionClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sessão expirada");
  return { supabase, user };
}
