import { normalizeDescription } from "@/lib/importers/normalize";

export type RuleOperator = "contains" | "starts_with" | "equals" | "regex";

export type CategorizationRule = {
  id: string;
  priority: number;
  operator: RuleOperator;
  pattern: string;
  direction: "any" | "in" | "out";
  amountMinCents: number | null;
  amountMaxCents: number | null;
  accountId: string | null;
  categoryId: string | null;
  contactId: string | null;
  tagIds: string[];
  active: boolean;
};

export type RuleTarget = { description: string; amountCents: number; accountId: string };

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

/** Regex do usuário com limite de tamanho e flag i; inválida = nunca casa. */
const regexCache = new Map<string, RegExp | null>();
function userRegex(pattern: string): RegExp | null {
  if (regexCache.has(pattern)) return regexCache.get(pattern)!;
  let re: RegExp | null = null;
  try {
    if (pattern.length <= 200) re = new RegExp(pattern, "i");
  } catch {
    re = null;
  }
  regexCache.set(pattern, re);
  return re;
}

export function isValidRegex(pattern: string) {
  return userRegex(pattern) !== null;
}

/** Testa uma regra contra a descrição original e a normalizada (sem prefixos/códigos). */
export function ruleMatches(rule: CategorizationRule, t: RuleTarget): boolean {
  if (!rule.active) return false;
  if (rule.accountId && rule.accountId !== t.accountId) return false;
  if (rule.direction === "in" && t.amountCents < 0) return false;
  if (rule.direction === "out" && t.amountCents > 0) return false;
  const abs = Math.abs(t.amountCents);
  if (rule.amountMinCents !== null && abs < rule.amountMinCents) return false;
  if (rule.amountMaxCents !== null && abs > rule.amountMaxCents) return false;

  if (rule.operator === "regex") {
    const re = userRegex(rule.pattern);
    return !!re && (re.test(t.description) || re.test(normalizeDescription(t.description)));
  }
  const p = fold(rule.pattern);
  if (!p) return false;
  const candidates = [fold(t.description), normalizeDescription(t.description)];
  return candidates.some((d) =>
    rule.operator === "contains" ? d.includes(p) : rule.operator === "starts_with" ? d.startsWith(p) : d === p,
  );
}

/** Primeira regra que casa, por prioridade (menor primeiro) e depois pela mais específica (padrão mais longo). */
export function findRule(rules: CategorizationRule[], t: RuleTarget): CategorizationRule | null {
  const sorted = [...rules].sort((a, b) => a.priority - b.priority || b.pattern.length - a.pattern.length);
  return sorted.find((r) => ruleMatches(r, t)) ?? null;
}

/** Sugere um padrão "contém" a partir de uma descrição de extrato. */
export function suggestPattern(description: string): string {
  const norm = normalizeDescription(description);
  return norm.split(" ").slice(0, 3).join(" ") || fold(description).slice(0, 40);
}
