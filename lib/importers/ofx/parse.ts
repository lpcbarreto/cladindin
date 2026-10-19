import { decodeBankFile } from "../encoding";
import { ImportError, type ParsedStatement, type ParsedTransaction, type ParseResult } from "../types";

/** Nó da árvore OFX: agregados têm filhos, folhas têm valor. */
type Node = { name: string; value: string | null; children: Node[] };

// Agregados conhecidos. Qualquer outra tag é folha, mesmo vazia (SGML não fecha folhas).
const AGGREGATES = new Set([
  "OFX", "SIGNONMSGSRSV1", "SONRS", "STATUS", "FI",
  "BANKMSGSRSV1", "STMTTRNRS", "STMTRS", "BANKACCTFROM", "BANKACCTTO", "BANKTRANLIST", "STMTTRN",
  "LEDGERBAL", "AVAILBAL", "BALLIST", "BAL", "PAYEE", "CURRENCY", "ORIGCURRENCY",
  "CREDITCARDMSGSRSV1", "CCSTMTTRNRS", "CCSTMTRS", "CCACCTFROM", "CCACCTTO",
  "INVSTMTMSGSRSV1", "MSGSETLIST", "SIGNUPMSGSRSV1",
]);

function decodeEntities(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

/** Tokeniza SGML (OFX 1.x) ou XML (OFX 2.x) numa árvore tolerante a tags sem fechamento. */
export function buildTree(body: string): Node {
  const root: Node = { name: "#root", value: null, children: [] };
  const stack: Node[] = [root];
  const re = /<(\/?)([A-Za-z0-9_.]+)(?:\s[^>]*)?>([^<]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const [, closing, rawName, rawText] = m;
    const name = rawName.toUpperCase();
    const top = stack[stack.length - 1];
    if (closing) {
      const idx = stack.map((n) => n.name).lastIndexOf(name);
      if (idx > 0) stack.length = idx; // fecha o agregado e quaisquer agregados abertos dentro dele
      continue;
    }
    if (AGGREGATES.has(name)) {
      // OFX não aninha agregados de mesmo nome: um <STMTTRN> sem fechamento é fechado pelo próximo
      const open = stack.map((n) => n.name).lastIndexOf(name);
      if (open > 0) stack.length = open;
      const node: Node = { name, value: null, children: [] };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    } else {
      top.children.push({ name, value: decodeEntities(rawText.replace(/\s+/g, " ").trim()), children: [] });
    }
  }
  return root;
}

function find(node: Node, name: string): Node | undefined {
  for (const c of node.children) {
    if (c.name === name) return c;
    const deep = find(c, name);
    if (deep) return deep;
  }
  return undefined;
}

function findAll(node: Node, name: string, out: Node[] = []): Node[] {
  for (const c of node.children) {
    if (c.name === name) out.push(c);
    else findAll(c, name, out);
  }
  return out;
}

function leaf(node: Node | undefined, name: string): string | null {
  const v = node?.children.find((c) => c.name === name)?.value;
  return v ? v : null;
}

/** OFX: AAAAMMDD[HHMMSS[.XXX]][[-3:BRT]]. Ignoramos hora e fuso: vale a data do banco. */
export function parseOfxDate(raw: string | null): string | null {
  const m = raw?.trim().match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d || y < 1900) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * Valor OFX: ponto decimal no padrão, mas bancos BR mandam vírgula. Não há separador de milhar
 * no OFX, então com um único separador ele é o decimal; com os dois, o último é o decimal.
 */
export function parseOfxAmount(raw: string | null): number | null {
  if (!raw) return null;
  let s = raw.trim().replace(/\s/g, "").replace(/^R\$/i, "");
  let sign = 1;
  if (s.startsWith("-")) {
    sign = -1;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  if (s.endsWith("-")) {
    sign = -sign;
    s = s.slice(0, -1);
  }
  const last = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  const intPart = last >= 0 ? s.slice(0, last).replace(/[.,]/g, "") : s;
  const frac = last >= 0 ? s.slice(last + 1) : "";
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(frac) || intPart + frac === "") return null;
  const cents = Number(intPart || "0") * 100 + Math.round(Number(`0.${frac || "0"}`) * 100);
  return sign * cents;
}

function combineDescription(name: string | null, memo: string | null): string {
  const n = name?.trim() ?? "";
  const m = memo?.trim() ?? "";
  if (!n) return m;
  if (!m) return n;
  // NAME costuma vir truncado em 32 caracteres e repetido no MEMO
  if (m.toUpperCase().startsWith(n.toUpperCase()) || m.toUpperCase().includes(n.toUpperCase())) return m;
  if (n.toUpperCase().includes(m.toUpperCase())) return n;
  return `${n} - ${m}`;
}

function parseStatement(stmt: Node, source: ParsedStatement["source"], warnings: string[]): ParsedStatement {
  const acct = find(stmt, source === "bank" ? "BANKACCTFROM" : "CCACCTFROM");
  const list = find(stmt, "BANKTRANLIST");
  const ledger = find(stmt, "LEDGERBAL");

  const transactions: ParsedTransaction[] = [];
  findAll(stmt, "STMTTRN").forEach((t, i) => {
    const date = parseOfxDate(leaf(t, "DTPOSTED")) ?? parseOfxDate(leaf(t, "DTUSER"));
    const amount = parseOfxAmount(leaf(t, "TRNAMT"));
    const payee = find(t, "PAYEE");
    const description = combineDescription(leaf(t, "NAME") ?? leaf(payee, "NAME"), leaf(t, "MEMO"));
    if (!date || amount === null) {
      warnings.push(`Lançamento ${i + 1} ignorado: data ou valor ilegível.`);
      return;
    }
    if (amount === 0) {
      warnings.push(`Lançamento ${i + 1} ignorado: valor zero.`);
      return;
    }
    transactions.push({
      externalId: leaf(t, "FITID"),
      date,
      amountCents: amount,
      description: description || (amount < 0 ? "Débito sem descrição" : "Crédito sem descrição"),
      kind: leaf(t, "TRNTYPE")?.toUpperCase() ?? null,
      checkNum: leaf(t, "CHECKNUM"),
      refNum: leaf(t, "REFNUM"),
    });
  });

  // FITID repetido dentro do mesmo extrato não é confiável: descartamos e caímos no fingerprint
  const seen = new Map<string, number>();
  transactions.forEach((t) => t.externalId && seen.set(t.externalId, (seen.get(t.externalId) ?? 0) + 1));
  const repeated = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  if (repeated.length) {
    warnings.push(`${repeated.length} identificador(es) FITID repetido(s) no arquivo; usaremos data, valor e descrição para evitar duplicidade.`);
    transactions.forEach((t) => {
      if (t.externalId && repeated.includes(t.externalId)) t.externalId = null;
    });
  }

  const balanceAmount = parseOfxAmount(leaf(ledger, "BALAMT"));
  const balanceDate = parseOfxDate(leaf(ledger, "DTASOF"));
  return {
    source,
    bankId: leaf(acct, "BANKID")?.replace(/^0+(?=\d)/, "") ?? null,
    branchId: leaf(acct, "BRANCHID"),
    accountId: leaf(acct, "ACCTID"),
    accountType: leaf(acct, "ACCTTYPE") ?? (source === "credit_card" ? "CREDITCARD" : null),
    currency: leaf(stmt, "CURDEF") ?? "BRL",
    startDate: parseOfxDate(leaf(list, "DTSTART")),
    endDate: parseOfxDate(leaf(list, "DTEND")),
    balance: balanceAmount !== null && balanceDate ? { amountCents: balanceAmount, date: balanceDate } : null,
    transactions,
  };
}

export function looksLikeOfx(text: string) {
  return /<OFX[\s>]/i.test(text) || /OFXHEADER/i.test(text.slice(0, 500));
}

/** Converte um arquivo OFX (bytes) em extratos normalizados. */
export function parseOfx(bytes: Uint8Array): ParseResult {
  const { text } = decodeBankFile(bytes);
  if (!looksLikeOfx(text)) {
    throw new ImportError(
      "O arquivo não parece ser um OFX.",
      "No app ou internet banking, exporte o extrato no formato OFX (às vezes chamado de Money ou Quicken).",
    );
  }
  const start = text.search(/<OFX[\s>]/i);
  const tree = buildTree(start >= 0 ? text.slice(start) : text);
  const warnings: string[] = [];
  const statements = [
    ...findAll(tree, "STMTRS").map((s) => parseStatement(s, "bank", warnings)),
    ...findAll(tree, "CCSTMTRS").map((s) => parseStatement(s, "credit_card", warnings)),
  ];
  if (!statements.length) {
    const status = find(tree, "STATUS");
    const msg = leaf(status, "MESSAGE");
    throw new ImportError(
      `O OFX não contém extrato de conta nem de cartão${msg ? ` (mensagem do banco: ${msg})` : ""}.`,
      "Confira se escolheu um período com movimentações ao exportar.",
    );
  }
  return { parser: "ofx", statements, warnings };
}
