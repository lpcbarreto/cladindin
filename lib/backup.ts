import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Tabelas copiadas no backup diário (dados do produto; registros técnicos ficam de fora). */
export const BACKUP_TABLES = [
  "profiles",
  "workspaces",
  "workspace_members",
  "invites",
  "accounts",
  "credit_cards",
  "invoices",
  "categories",
  "cost_centers",
  "tags",
  "contacts",
  "transactions",
  "transaction_tags",
  "recurrence_rules",
  "categorization_rules",
  "budgets",
  "import_batches",
  "account_import_links",
  "import_templates",
  "attachments",
  "savings_goals",
  "goal_contributions",
  "notification_prefs",
  "audit_log",
] as const;

const MAGIC = Buffer.from("CLDB1");
const KEEP_DAYS = 14;

const keyFrom = (secret: string) => createHash("sha256").update(secret, "utf8").digest();

/** gzip + AES-256-GCM. Formato: "CLDB1" | iv (12) | tag (16) | dados cifrados. */
export function sealBackup(json: string, secret: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const enc = Buffer.concat([cipher.update(gzipSync(Buffer.from(json, "utf8"))), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), enc]);
}

export function openBackup(buf: Buffer, secret: string): string {
  if (!buf.subarray(0, 5).equals(MAGIC)) throw new Error("Arquivo não é um backup do Cladindin");
  const iv = buf.subarray(5, 17);
  const tag = buf.subarray(17, 33);
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), iv);
  decipher.setAuthTag(tag);
  return gunzipSync(Buffer.concat([decipher.update(buf.subarray(33)), decipher.final()])).toString("utf8");
}

/**
 * Copia todas as tabelas, cifra com BACKUP_KEY e guarda na pasta privada "backups"
 * (um arquivo por dia; apaga os de mais de 14 dias). Roda com a chave de serviço, no job diário.
 */
export async function runBackup(db: SupabaseClient, today: string) {
  const secret = process.env.BACKUP_KEY;
  if (!secret || secret.length < 24) return { skipped: "BACKUP_KEY ausente ou curta (mínimo 24 caracteres)" };

  const data: Record<string, unknown[]> = {};
  for (const t of BACKUP_TABLES) {
    const rows: unknown[] = [];
    for (let page = 0; page < 500; page++) {
      const { data: chunk, error } = await db.from(t).select("*").range(page * 1000, page * 1000 + 999);
      if (error) throw new Error(`backup: falha ao ler ${t}`);
      rows.push(...(chunk ?? []));
      if (!chunk || chunk.length < 1000) break;
    }
    data[t] = rows;
  }
  const file = sealBackup(JSON.stringify({ format: "cladindin-backup-v1", created_at: new Date().toISOString(), money: "centavos", data }), secret);
  const { error } = await db.storage.from("backups").upload(`${today}.cldb`, file, { contentType: "application/octet-stream", upsert: true });
  if (error) throw new Error("backup: falha ao gravar o arquivo");

  // Mantém só os últimos 14 dias
  const limit = new Date(`${today}T12:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() - KEEP_DAYS);
  const cut = limit.toISOString().slice(0, 10);
  const { data: files } = await db.storage.from("backups").list("", { limit: 1000 });
  const old = (files ?? []).map((f) => f.name).filter((n) => /^\d{4}-\d{2}-\d{2}\.cldb$/.test(n) && n.slice(0, 10) < cut);
  if (old.length) await db.storage.from("backups").remove(old);
  return { bytes: file.length, tables: BACKUP_TABLES.length, removed: old.length };
}
