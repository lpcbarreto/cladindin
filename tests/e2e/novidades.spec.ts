import { expect, test } from "@playwright/test";

/**
 * Lançamento rápido, busca (Ctrl+K), desfazer exclusão, metas e projeção.
 * Requer usuário de TESTE: E2E_EMAIL=... E2E_PASSWORD=... pnpm e2e
 * Cria um workspace descartável a cada execução.
 */
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.skip(!email || !password, "Defina E2E_EMAIL e E2E_PASSWORD de um usuário de teste");

test("lançamento rápido → busca → excluir e desfazer → meta → projeção", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("E-mail").fill(email!);
  await page.getByPlaceholder("Senha").fill(password!);
  await page.getByRole("button", { name: "Entrar", exact: true }).last().click();
  await page.waitForURL(/\/w\/.+\/dashboard/);

  await page.getByRole("link", { name: "Configurações" }).click();
  await page.getByPlaceholder("Ex.: Minha Empresa").fill(`E2E ${Date.now()}`);
  await page.getByRole("button", { name: "Criar", exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  const base = page.url().replace(/\/dashboard.*/, "");

  await page.goto(`${base}/contas`);
  await page.getByPlaceholder("Ex.: Nubank, Itaú PJ").fill("Banco E2E");
  await page.getByPlaceholder("0,00").fill("100,00");
  await page.getByRole("button", { name: "Salvar conta" }).click();
  await expect(page.getByText("Conta criada.")).toBeVisible();

  // Lançamento rápido pela tecla N
  await page.goto(`${base}/dashboard`);
  await page.locator("body").press("n");
  await page.getByLabel("Lançamento rápido").getByRole("textbox").fill("padaria e2e 12,50 banco");
  await page.getByRole("button", { name: "Lançar" }).click();
  await expect(page.getByText(/Despesa de R\$\s?12,50 em Banco E2E/)).toBeVisible();
  await page.keyboard.press("Escape");

  // Busca global
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder(/Buscar lançamentos/).fill("padaria e2e");
  await expect(page.getByRole("option", { name: /Padaria e2e/i })).toBeVisible();
  await page.keyboard.press("Escape");

  // Excluir e desfazer
  await page.goto(`${base}/lancamentos`);
  await page.getByLabel(/Selecionar Padaria e2e/i).check();
  await page.getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByText("Lançamento excluído")).toBeVisible();
  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(page.getByRole("link", { name: /Padaria e2e/i })).toBeVisible();

  // Meta
  await page.goto(`${base}/metas`);
  await page.getByPlaceholder("Viagem de férias").fill("Reserva E2E");
  await page.getByPlaceholder("5.000,00").fill("1.000,00");
  await page.getByRole("button", { name: "Criar meta" }).click();
  await expect(page.getByRole("heading", { name: "Reserva E2E" })).toBeVisible();
  await page.getByLabel("Valor").fill("250,00");
  await page.getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByText("25%")).toBeVisible();

  // Projeção
  await page.goto(`${base}/projecao`);
  await expect(page.getByRole("heading", { name: "Projeção de saldo" })).toBeVisible();
  await expect(page.getByText("Saldo hoje")).toBeVisible();
});
