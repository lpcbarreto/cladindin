// CSV no padrão do Excel brasileiro: separador ";" e BOM UTF-8.
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  // Evita injeção de fórmulas ao abrir no Excel
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(header: string[], rows: unknown[][]): string {
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n");
}
