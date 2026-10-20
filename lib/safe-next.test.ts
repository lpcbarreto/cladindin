import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("aceita caminhos internos", () => {
    expect(safeNext("/w/abc/dashboard?mes=2026-10")).toBe("/w/abc/dashboard?mes=2026-10");
    expect(safeNext("/redefinir-senha")).toBe("/redefinir-senha");
  });
  it("recusa destinos externos e truques de barra", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "/\t/evil.com", "https://evil.com", "evil.com", "/ /evil.com", "", null, undefined]) {
      expect(safeNext(bad)).toBe("/");
    }
  });
});
