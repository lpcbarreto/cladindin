import { describe, expect, it } from "vitest";
import { csvCell, toCSV } from "./csv";

describe("csv", () => {
  it("escapa separador e aspas", () => {
    expect(csvCell('a;"b"')).toBe('"a;""b"""');
  });
  it("neutraliza fórmulas, mas mantém números negativos", () => {
    expect(csvCell("=HYPERLINK()")).toBe("'=HYPERLINK()");
    expect(csvCell("-12,50")).toBe("-12,50");
  });
  it("gera BOM e CRLF", () => {
    expect(toCSV(["a"], [["1"]])).toBe("﻿a\r\n1");
  });
});
