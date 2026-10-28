import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Auditoria automática (WCAG 2.1 A/AA) das páginas públicas, nos temas claro e escuro.
const PAGES = ["/", "/ajuda", "/login", "/termos", "/privacidade", "/cookies", "/reembolso", "/lgpd", "/acessibilidade"];

for (const scheme of ["light", "dark"] as const) {
  test.describe(`acessibilidade (${scheme})`, () => {
    test.use({ colorScheme: scheme });
    for (const path of PAGES) {
      test(`${path} sem violações`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        const summary = results.violations.map((v) => `${v.id}: ${v.nodes.length}x — ${v.nodes[0]?.target.join(" ")} — ${v.nodes[0]?.failureSummary?.split("\n")[1] ?? ""}`);
        expect(summary, summary.join("\n")).toEqual([]);
      });
    }
  });
}

test("navegação por teclado: atalho para o conteúdo e foco visível", async ({ page }) => {
  await page.goto("/termos");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Pular para o conteúdo" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
});
