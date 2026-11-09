import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export const TRASH_DAYS = 30;

/**
 * Minimização (LGPD art. 16): apaga de vez o que está na lixeira há mais de 30 dias,
 * junto com os arquivos de comprovante, e limpa sinais de segurança com mais de 7 dias.
 */
export async function runRetention(db: SupabaseClient) {
  const cutoff = new Date(Date.now() - TRASH_DAYS * 86_400_000).toISOString();
  let removedTx = 0;
  let removedFiles = 0;
  for (let round = 0; round < 20; round++) {
    const { data: old } = await db.from("transactions").select("id").not("deleted_at", "is", null).lt("deleted_at", cutoff).limit(500);
    const ids = (old ?? []).map((t) => t.id);
    if (!ids.length) break;
    const { data: files } = await db.from("attachments").select("storage_path").in("transaction_id", ids);
    const paths = (files ?? []).map((f) => f.storage_path).filter(Boolean);
    if (paths.length) {
      const { error } = await db.storage.from("comprovantes").remove(paths);
      if (error) throw new Error("limpeza: falha ao remover comprovantes");
      removedFiles += paths.length;
    }
    const { error } = await db.from("transactions").delete().in("id", ids);
    if (error) throw new Error("limpeza: falha ao apagar lançamentos");
    removedTx += ids.length;
    if (ids.length < 500) break;
  }
  await db.from("security_events").delete().lt("at", new Date(Date.now() - 7 * 86_400_000).toISOString());
  await db.from("security_alert_log").delete().lt("hour", new Date(Date.now() - 30 * 86_400_000).toISOString());
  return { removedTx, removedFiles };
}
