// Validação de CPF/CNPJ pelos dígitos verificadores.
export function onlyDigits(s: string) {
  return s.replace(/\D/g, "");
}

function checkDigit(digits: number[], weights: number[]) {
  const sum = digits.reduce((acc, d, i) => acc + d * weights[i], 0);
  const r = sum % 11;
  return r < 2 ? 0 : 11 - r;
}

export function isValidCPF(input: string): boolean {
  const d = onlyDigits(input);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const n = [...d].map(Number);
  const d1 = checkDigit(n.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = checkDigit(n.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === n[9] && d2 === n[10];
}

export function isValidCNPJ(input: string): boolean {
  const d = onlyDigits(input);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const n = [...d].map(Number);
  const d1 = checkDigit(n.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = checkDigit(n.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === n[12] && d2 === n[13];
}

export function formatDocument(d: string | null): string {
  if (!d) return "";
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return d;
}
