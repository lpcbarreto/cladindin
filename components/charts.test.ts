import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BalanceChart, FlowChart, RankChart, niceScale } from "./charts";

describe("gráficos leves", () => {
  it("escala redonda que inclui o zero", () => {
    expect(niceScale(0, 0).values).toEqual([0, 2500, 5000, 7500, 10000]);
    const s = niceScale(0, 345678);
    expect(s.values[0]).toBe(0);
    expect(s.hi).toBeGreaterThanOrEqual(345678);
    const neg = niceScale(-12000, 30000);
    expect(neg.lo).toBeLessThanOrEqual(-12000);
    expect(neg.values).toContain(0);
  });

  it("renderizam no servidor com tooltip e acessibilidade", () => {
    const flow = renderToStaticMarkup(h(FlowChart, { data: [{ month: "2026-09", income: 350000, expense: 120000 }] }));
    expect(flow).toContain('role="img"');
    expect(flow).toContain("Receitas");
    expect(flow).toContain("data-tip");
    expect(flow).toMatch(/R\$\s?3\.500,00/);

    const bal = renderToStaticMarkup(h(BalanceChart, { zeroLine: true, data: [
          { date: "2026-10-01", balance: 10000 },
          { date: "2026-10-02", balance: -5000 },
        ] }));
    expect(bal).toContain("<polyline");
    expect(bal).toContain("stroke-dasharray"); // linha do zero

    const rank = renderToStaticMarkup(h(RankChart, { kind: "expense", data: [{ name: "Mercado", total: 5000 }] }));
    expect(rank).toContain("Mercado");
  });
});
