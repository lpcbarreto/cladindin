// Abre um backup diário do Cladindin (arquivo .cldb baixado da pasta "backups" do Supabase Storage).
// Uso:  BACKUP_KEY="sua chave" node scripts/abrir-backup.mjs 2026-11-09.cldb
// Gera 2026-11-09.json ao lado do arquivo. Guarde o JSON em lugar seguro e apague quando não precisar mais.
import { createDecipheriv, createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const [file] = process.argv.slice(2);
const secret = process.env.BACKUP_KEY;
if (!file || !secret) {
  console.error('Uso: BACKUP_KEY="sua chave" node scripts/abrir-backup.mjs ARQUIVO.cldb');
  process.exit(1);
}
const buf = readFileSync(file);
if (buf.subarray(0, 5).toString() !== "CLDB1") throw new Error("Arquivo não é um backup do Cladindin");
const decipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(secret, "utf8").digest(), buf.subarray(5, 17));
decipher.setAuthTag(buf.subarray(17, 33));
const json = gunzipSync(Buffer.concat([decipher.update(buf.subarray(33)), decipher.final()])).toString("utf8");
const out = file.replace(/\.cldb$/, "") + ".json";
writeFileSync(out, json);
console.log(`Backup aberto: ${out}`);
