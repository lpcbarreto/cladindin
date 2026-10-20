import { parseMoneyToCents } from "@/lib/finance/money";
import { addDays } from "@/lib/finance/dates";

export type QuickAccount = { id: string; name: string };
export type QuickParse = {
  description: string;
  amountCents: number | null;
  type: "income" | "expense";
  accountId: string | null;
  date: string;
};

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const MONEY_RE = /^[+-]?(r\$)?\d{1,3}(\.\d{3})*(,\d{1,2})?$|^[+-]?(r\$)?\d+([.,]\d{1,2})?$/i;
const INCOME_WORDS = new Set(["recebi", "receita", "salario", "entrada", "ganhei", "pix-recebido"]);

/**
 * Entende textos como "mercado 120 nubank", "+3500 salário", "uber 23,90 ontem" ou "luz 180 10/11".
 * O valor é o primeiro número com cara de dinheiro; a conta é a palavra que bate com o início do nome de uma conta.
 */
export function parseQuickAdd(text: string, accounts: QuickAccount[], today: string): QuickParse {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const rest: string[] = [];
  let amountCents: number | null = null;
  let type: QuickParse["type"] = "expense";
  let accountId: string | null = null;
  let date = today;

  for (const tok of tokens) {
    const f = fold(tok);
    if (amountCents === null && MONEY_RE.test(tok)) {
      if (tok.startsWith("+")) type = "income";
      try {
        amountCents = Math.abs(parseMoneyToCents(tok));
        if (amountCents === 0) amountCents = null;
        else continue;
      } catch {
        amountCents = null;
      }
    }
    if (f === "hoje") continue;
    if (f === "ontem") {
      date = addDays(today, -1);
      continue;
    }
    if (f === "anteontem") {
      date = addDays(today, -2);
      continue;
    }
    const dm = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(tok);
    if (dm) {
      const y = dm[3] ? (dm[3].length === 2 ? `20${dm[3]}` : dm[3]) : today.slice(0, 4);
      const iso = `${y}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`;
      if (!Number.isNaN(Date.parse(`${iso}T12:00:00Z`)) && new Date(`${iso}T12:00:00Z`).toISOString().startsWith(iso)) {
        date = iso;
        continue;
      }
    }
    if (!accountId && f.length >= 3) {
      const acc = accounts.find((a) => fold(a.name).split(/\s+/).some((w) => w.startsWith(f)) || fold(a.name) === f);
      if (acc) {
        accountId = acc.id;
        continue;
      }
    }
    if (INCOME_WORDS.has(f)) type = "income";
    rest.push(tok);
  }

  const description = rest.join(" ").replace(/^./, (c) => c.toUpperCase());
  return { description, amountCents, type, accountId, date };
}
