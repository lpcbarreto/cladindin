import { afterEach, describe, expect, it, vi } from "vitest";
import { pwnedCount, weakPasswordReason } from "./pwned";

afterEach(() => vi.unstubAllGlobals());

describe("senha vazada", () => {
  it("envia só o prefixo do hash e acha o sufixo na resposta", async () => {
    // SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
    const fetchMock = vi.fn(async () => new Response("0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:9659365\r\n"));
    vi.stubGlobal("fetch", fetchMock);
    expect(await pwnedCount("password")).toBe(9659365);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe("https://api.pwnedpasswords.com/range/5BAA6");
  });
  it("serviço fora do ar não bloqueia", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await pwnedCount("qualquer")).toBe(0);
  });
  it("regras mínimas", () => {
    expect(weakPasswordReason("curta")).toMatch(/8 caracteres/);
    expect(weakPasswordReason("12345678")).toMatch(/fácil/);
    expect(weakPasswordReason("Ver@o-na-praia-2026")).toBeNull();
  });
});
