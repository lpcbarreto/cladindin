// Valores monetários sempre em centavos (inteiros). Nunca float.
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(cents: number | bigint): string {
  return brl.format(Number(cents) / 100);
}

/** Converte "1.234,56", "1234.56", "-R$ 10,00" ou "(10,00)" em centavos. */
export function parseMoneyToCents(input: string): number {
  let s = input.trim().replace(/R\$\s?/i, "").replace(/\s/g, "");
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  const decimalSep = lastComma > lastDot ? "," : lastDot > lastComma ? "." : null;
  let intPart = s;
  let fracPart = "";
  if (decimalSep) {
    const idx = s.lastIndexOf(decimalSep);
    const tail = s.slice(idx + 1);
    // "1.234" sem vírgula = milhar, não decimal
    if (!(decimalSep === "." && lastComma === -1 && tail.length === 3 && s.split(".").length > 1 && /^\d{1,3}(\.\d{3})+$/.test(s))) {
      intPart = s.slice(0, idx);
      fracPart = tail;
    }
  }
  intPart = intPart.replace(/[.,]/g, "");
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart) || (intPart + fracPart) === "") {
    throw new Error(`Valor inválido: "${input}"`);
  }
  const frac = (fracPart + "00").slice(0, 2);
  const roundUp = fracPart.length > 2 && Number(fracPart[2]) >= 5 ? 1 : 0;
  const cents = Number(intPart || "0") * 100 + Number(frac) + roundUp;
  return negative ? -cents : cents;
}
