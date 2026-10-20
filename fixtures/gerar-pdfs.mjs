// Gera PDFs sintéticos (dados fictícios) para testar a importação: node fixtures/gerar-pdfs.mjs
import { writeFileSync } from "node:fs";

function makePdf(lines) {
  const esc = (s) => s.replace(/[\\()]/g, (ch) => "\\" + ch);
  const content = ["BT", "/F1 10 Tf", "40 800 Td", "14 TL", ...lines.map((l) => `(${esc(l)}) Tj T*`), "ET"].join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

const dir = new URL("./pdf/", import.meta.url);
writeFileSync(new URL("extrato-banco.pdf", dir), makePdf([
  "BANCO FICTICIO S.A. - Extrato de conta corrente",
  "Periodo: 01/10/2026 a 15/10/2026",
  "Data  Historico  Valor  Saldo",
  "01/10 SALDO ANTERIOR 2.000,00 C",
  "02/10 PIX RECEBIDO CLIENTE FICTICIO 850,00 C 2.850,00 C",
  "03/10 COMPRA DEBITO SUPERMERCADO EXEMPLO 312,45 D 2.537,55 C",
  "TARIFA PACOTE SERVICOS 24,90 D 2.512,65 C",
  "06/10 PAGAMENTO BOLETO INTERNET 99,90 D 2.412,75 C",
  "10/10 TED RECEBIDA SALARIO EMPRESA FICTICIA 4.500,00 C 6.912,75 C",
  "12/10 PIX ENVIADO ALUGUEL 1.800,00 D 5.112,75 C",
  "SALDO FINAL 5.112,75 C",
]));
writeFileSync(new URL("comprovante-pix.pdf", dir), makePdf([
  "Comprovante de transferencia",
  "Pix enviado",
  "Valor R$ 150,00",
  "Data 14/10/2026 as 10:15",
  "Destino",
  "Nome",
  "MARIA FICTICIA SOUZA",
  "CPF ***.123.456-**",
  "Instituicao BANCO EXEMPLO",
]));
writeFileSync(new URL("comprovante-boleto.pdf", dir), makePdf([
  "Comprovante de pagamento",
  "Boleto",
  "Beneficiario: ENERGIA FICTICIA SA",
  "Data do pagamento: 15/10/2026",
  "Valor pago R$ 187,32",
]));
writeFileSync(new URL("fatura-cartao.pdf", dir), makePdf([
  "Fatura do cartao FICTICIO",
  "Vencimento: 10/11/2026",
  "Total desta fatura R$ 545,80",
  "20/10 LOJA FICTICIA 300,00",
  "21/10 APP TRANSPORTE 45,80",
  "25/10 RESTAURANTE EXEMPLO 200,00",
]));
console.log("PDFs gerados em fixtures/pdf");
