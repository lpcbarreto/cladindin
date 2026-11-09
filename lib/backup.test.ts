import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { openBackup, sealBackup } = await import("./backup");

describe("backup cifrado", () => {
  const secret = "uma-chave-de-teste-bem-comprida-123";
  it("abre o que foi fechado com a mesma chave", () => {
    const json = JSON.stringify({ a: 1, texto: "ção" });
    expect(openBackup(sealBackup(json, secret), secret)).toBe(json);
  });
  it("recusa chave errada e arquivo alterado", () => {
    const sealed = sealBackup("{}", secret);
    expect(() => openBackup(sealed, "outra-chave-bem-comprida-000000")).toThrow();
    const tampered = Buffer.from(sealed);
    tampered[tampered.length - 1] ^= 1;
    expect(() => openBackup(tampered, secret)).toThrow();
  });
});
