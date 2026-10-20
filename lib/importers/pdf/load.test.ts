import { describe, expect, it } from "vitest";
import { loadBankFile } from "../index";

/** PDF mínimo com uma linha de texto por item (como os PDFs gerados pelos bancos). */
function makePdf(lines: string[]): Uint8Array {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const content = ["BT", "/F1 10 Tf", "40 800 Td", "12 TL", ...lines.map((l) => `(${esc(l)}) Tj T*`), "ET"].join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}

describe("importar PDF de verdade (extração de texto)", () => {
  it("extrato", async () => {
    const f = await loadBankFile(
      "extrato.pdf",
      makePdf([
        "Extrato de conta corrente - periodo 01/10/2026 a 15/10/2026",
        "02/10 PIX RECEBIDO MARIA 350,00 C",
        "03/10 COMPRA DEBITO PADARIA 23,90 D",
        "SALDO FINAL 1.326,10 C",
      ]),
    );
    expect(f.kind).toBe("pdf-statement");
    if (f.kind !== "pdf-statement") return;
    expect(f.result.statement.transactions.map((t) => t.amountCents)).toEqual([35000, -2390]);
  });

  it("comprovante de Pix", async () => {
    const f = await loadBankFile(
      "pix.pdf",
      makePdf(["Comprovante de Pix", "Pix enviado", "Valor R$ 1.250,00", "Data 18/10/2026", "Destino", "Nome", "JOAO DA SILVA"]),
    );
    expect(f.kind).toBe("receipt");
    if (f.kind !== "receipt") return;
    expect(f.receipt).toMatchObject({ amountCents: 125000, date: "2026-10-18", description: "Pix para Joao Da Silva" });
  });

  it("fatura de cartão", async () => {
    const f = await loadBankFile(
      "fatura.pdf",
      makePdf(["Fatura do cartao", "Vencimento: 10/11/2026", "Total desta fatura R$ 330,00", "20/10 LOJA EXEMPLO 300,00", "21/10 APP TRANSPORTE 30,00"]),
    );
    expect(f.kind).toBe("pdf");
  });

  it("PDF sem texto (escaneado) dá erro explicativo", async () => {
    await expect(loadBankFile("scan.pdf", makePdf([]))).rejects.toThrow(/imagem escaneada/);
  });
});
