import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Map([
  ["application/pdf", [0x25, 0x50, 0x44, 0x46]], // %PDF
  ["image/jpeg", [0xff, 0xd8, 0xff]],
  ["image/png", [0x89, 0x50, 0x4e, 0x47]],
  ["image/webp", [0x52, 0x49, 0x46, 0x46]], // RIFF
  ["image/heic", null],
]);

/** Valida tipo pelo conteúdo (não só pela extensão) e envia ao bucket privado "comprovantes". */
export async function saveAttachment(supabase: SupabaseClient, workspaceId: string, transactionId: string, file: File) {
  if (file.size === 0) return { ok: false as const, message: "Arquivo vazio." };
  if (file.size > MAX_ATTACHMENT_BYTES) return { ok: false as const, message: "Comprovante passa de 10 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const magic = ALLOWED.get(file.type);
  if (magic === undefined || (magic && !magic.every((b, i) => bytes[i] === b))) {
    return { ok: false as const, message: "Envie PDF, JPG, PNG, WEBP ou HEIC." };
  }
  const safeName = file.name.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-80) || "comprovante";
  const path = `${workspaceId}/${transactionId}/${randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from("comprovantes").upload(path, bytes, { contentType: file.type, upsert: false });
  if (error) return { ok: false as const, message: "Não foi possível enviar o comprovante." };
  const { error: dbError } = await supabase.from("attachments").insert({
    workspace_id: workspaceId,
    transaction_id: transactionId,
    storage_path: path,
    file_name: file.name.slice(0, 200),
    size_bytes: file.size,
    mime_type: file.type,
  });
  if (dbError) {
    await supabase.storage.from("comprovantes").remove([path]);
    return { ok: false as const, message: "Não foi possível registrar o comprovante." };
  }
  return { ok: true as const };
}

/** Links temporários (5 min) para baixar os comprovantes de um lançamento. */
export async function listAttachments(supabase: SupabaseClient, transactionId: string) {
  const { data } = await supabase
    .from("attachments")
    .select("id, storage_path, file_name, size_bytes, mime_type, created_at")
    .eq("transaction_id", transactionId)
    .order("created_at");
  if (!data?.length) return [];
  const { data: signed } = await supabase.storage.from("comprovantes").createSignedUrls(
    data.map((a) => a.storage_path),
    300,
  );
  return data.map((a, i) => ({ ...a, url: signed?.[i]?.signedUrl ?? null }));
}
