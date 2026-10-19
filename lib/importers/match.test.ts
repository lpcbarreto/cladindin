import { describe, expect, it } from "vitest";
import { classifyRows, type ExistingTx, type IncomingRow } from "./match";
import { normalizeDescription, withFingerprints } from "./normalize";

const ACC = "acc-1";

function rows(list: Omit<IncomingRow, "index" | "fingerprint">[]): IncomingRow[] {
  return withFingerprints(ACC, list).map((r, index) => ({ ...r, index }));
}

const existing = (p: Partial<ExistingTx> & { id: string }): ExistingTx => ({
  date: "2026-10-05",
  amountCents: -5590,
  description: "",
  status: "paid",
  externalId: null,
  fingerprint: null,
  origin: "manual",
  ...p,
});

describe("normalizeDescription", () => {
  it.each([
    ["COMPRA CARTAO DEB PADARIA EXEMPLO 12/10 14:32", "PADARIA EXEMPLO"],
    ["PIX ENVIADO Maria Exemplo 12345678900", "MARIA EXEMPLO"],
    ["Pagamento conta Água", "PAGAMENTO CONTA AGUA"],
    ["LOJA ELETRO EXEMPLO PARC 03/10", "LOJA ELETRO EXEMPLO"],
  ])("%s → %s", (raw, expected) => expect(normalizeDescription(raw)).toBe(expected));
});

describe("withFingerprints", () => {
  it("diferencia compras idênticas no mesmo dia e é estável ao reimportar", () => {
    const base = [
      { date: "2026-10-04", amountCents: -4250, description: "Padaria", externalId: null },
      { date: "2026-10-04", amountCents: -4250, description: "Padaria", externalId: null },
    ];
    const a = withFingerprints(ACC, base);
    const b = withFingerprints(ACC, base);
    expect(a[0].fingerprint).not.toBe(a[1].fingerprint);
    expect(a.map((r) => r.fingerprint)).toEqual(b.map((r) => r.fingerprint));
  });
  it("muda conforme a conta", () => {
    const r = [{ date: "2026-10-04", amountCents: -100, description: "X" }];
    expect(withFingerprints("a", r)[0].fingerprint).not.toBe(withFingerprints("b", r)[0].fingerprint);
  });
});

describe("classifyRows", () => {
  it("reimportar o mesmo arquivo não duplica (por FITID e por fingerprint)", () => {
    const incoming = rows([
      { date: "2026-10-05", amountCents: -5590, description: "STREAMING", externalId: "F1" },
      { date: "2026-10-06", amountCents: -1000, description: "SEM FITID", externalId: null },
    ]);
    const db = [
      existing({ id: "t1", externalId: "F1", origin: "import" }),
      existing({ id: "t2", fingerprint: incoming[1].fingerprint, origin: "import" }),
    ];
    const res = classifyRows(incoming, db);
    expect(res.get(0)).toEqual({ kind: "imported", txId: "t1" });
    expect(res.get(1)).toEqual({ kind: "imported", txId: "t2" });
  });

  it("sugere conciliar com previsto de valor próximo (conta variável) e data próxima", () => {
    const incoming = rows([{ date: "2026-10-05", amountCents: -18973, description: "PAGAMENTO CONTA AGUA", externalId: "X" }]);
    const db = [
      existing({ id: "far", status: "planned", date: "2026-11-05", amountCents: -18000, description: "Conta de água" }),
      existing({ id: "near", status: "planned", date: "2026-10-03", amountCents: -18000, description: "Conta de água" }),
    ];
    expect(classifyRows(incoming, db).get(0)).toMatchObject({ kind: "reconcile", txId: "near" });
  });

  it("não concilia receita com despesa nem valor muito diferente", () => {
    const incoming = rows([{ date: "2026-10-05", amountCents: 18000, description: "X", externalId: null }]);
    const db = [
      existing({ id: "a", status: "planned", amountCents: -18000 }),
      existing({ id: "b", status: "planned", amountCents: 30000 }),
    ];
    expect(classifyRows(incoming, db).get(0)).toEqual({ kind: "new" });
  });

  it("marca possível duplicado de lançamento manual já pago e usa cada um só uma vez", () => {
    const incoming = rows([
      { date: "2026-10-05", amountCents: -5590, description: "A", externalId: "1" },
      { date: "2026-10-05", amountCents: -5590, description: "B", externalId: "2" },
    ]);
    const db = [existing({ id: "m1" })];
    const res = classifyRows(incoming, db);
    expect(res.get(0)).toEqual({ kind: "duplicate", txId: "m1" });
    expect(res.get(1)).toEqual({ kind: "new" });
  });
});
