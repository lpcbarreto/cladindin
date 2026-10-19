import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Fluxo crítico: entrar → criar workspace descartável → conta → importar OFX → conferir
 * deduplicação → ver no dashboard → desfazer. Requer usuário de TESTE:
 *   E2E_EMAIL=... E2E_PASSWORD=... pnpm e2e
 */
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const OFX = path.join(__dirname, "../../fixtures/ofx/banco-sgml-latin1.ofx");

test.skip(!email || !password, "Defina E2E_EMAIL e E2E_PASSWORD de um usuário de teste");

test("importar OFX → não duplicar → dashboard → desfazer", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("E-mail").fill(email!);
  await page.getByPlaceholder("Senha").fill(password!);
  await page.getByRole("button", { name: "Entrar", exact: true }).last().click();
  await page.waitForURL(/\/w\/.+\/dashboard/);

  // Workspace descartável
  await page.getByRole("link", { name: "Configurações" }).click();
  const wsName = `E2E ${Date.now()}`;
  await page.getByPlaceholder("Ex.: Minha Empresa").fill(wsName);
  await page.getByRole("button", { name: "Criar", exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  const base = page.url().replace(/\/dashboard.*/, "");

  // Conta corrente com saldo inicial
  await page.goto(`${base}/contas`);
  await page.getByPlaceholder("Ex.: Nubank, Itaú PJ").fill("Banco E2E");
  await page.getByPlaceholder("0,00").fill("0,00");
  await page.getByRole("button", { name: "Salvar conta" }).click();
  await expect(page.getByText("Conta criada.")).toBeVisible();

  // Importar
  const importOnce = async () => {
    await page.goto(`${base}/importar`);
    await page.locator('input[type="file"]').setInputFiles(OFX);
    await page.getByRole("button", { name: "Continuar" }).click();
    const select = page.locator("main select").first();
    if (await page.getByText("Escolha a conta ou o cartão de destino").isVisible().catch(() => false)) {
      await select.selectOption({ label: "Banco E2E" });
      await page.getByRole("button", { name: "Analisar lançamentos" }).click();
    }
    await expect(page.getByText(/nova\(s\)/).first()).toBeVisible();
  };

  await importOnce();
  await expect(page.getByText("PAG CONTA - PAGAMENTO CONTA ÁGUA SANEAMENTO", { exact: false }).or(page.locator('input[value*="ÁGUA"]'))).toBeVisible();
  await page.getByRole("button", { name: /Importar \d+ lançamento/ }).click();
  await expect(page.getByText(/5 nova\(s\)/)).toBeVisible();

  // Reimportar: nada novo
  await page.getByRole("button", { name: "Importar outro arquivo" }).click();
  await importOnce();
  await expect(page.getByText(/0 nova\(s\).*5 já importada\(s\)/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Importar 0 lançamento/ })).toBeDisabled();

  // Dashboard reflete o saldo: 3.500 − 189,73 − 55,90 − 12,00 − 1.250,00 = 1.992,37
  await page.goto(`${base}/dashboard`);
  await expect(page.getByText("R$ 1.992,37").first()).toBeVisible();

  // Desfazer importação
  await page.goto(`${base}/importacoes`);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Desfazer" }).first().click();
  await expect(page.getByText("Desfeita").first()).toBeVisible();

  // Limpeza: exclui o workspace de teste
  await page.goto(`${base}/configuracoes`);
  await page.getByPlaceholder(`Digite “${wsName}” para confirmar`).fill(wsName);
  await page.getByRole("button", { name: "Excluir definitivamente" }).click();
  await page.waitForURL(/\/dashboard|\/login/);
});
