import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadBankFile } from "../index";

const read = (f: string) => new Uint8Array(readFileSync(path.join(__dirname, "../../../fixtures/pdf", f)));

describe("PDFs de exemplo (fixtures/pdf)", () => {
  it("cada arquivo é reconhecido pelo tipo certo", async () => {
    const ext = await loadBankFile("extrato-banco.pdf", read("extrato-banco.pdf"));
    expect(ext.kind === "pdf-statement" && ext.result.statement.transactions.length).toBe(6);
    expect((await loadBankFile("comprovante-pix.pdf", read("comprovante-pix.pdf"))).kind).toBe("receipt");
    const bol = await loadBankFile("comprovante-boleto.pdf", read("comprovante-boleto.pdf"));
    expect(bol.kind === "receipt" && bol.receipt.description).toBe("Boleto – Energia Ficticia Sa");
    const fat = await loadBankFile("fatura-cartao.pdf", read("fatura-cartao.pdf"));
    expect(fat.kind === "pdf" && fat.invoice.totalCents).toBe(54580);
  });
});
