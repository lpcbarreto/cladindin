import { expect, test } from "@playwright/test";

test.describe("sem login", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("tela de login com marca, abas e tema", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Que bom te ver!" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Criar conta" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Link mágico" })).toBeVisible();
    await page.getByRole("radio", { name: "Escuro" }).first().click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.getByRole("radio", { name: "Claro" }).first().click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("área logada redireciona para o login e preserva o destino", async ({ page }) => {
    await page.goto("/w/00000000-0000-0000-0000-000000000000/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fw%2F/);
  });

  test("valida e-mail antes de chamar o servidor", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("E-mail").fill("nao-e-email");
    await page.getByPlaceholder("Senha").fill("qualquer");
    await page.getByPlaceholder("E-mail").evaluate((el: HTMLInputElement) => (el.type = "text"));
    await page.getByRole("button", { name: "Entrar", exact: true }).last().click();
    await expect(page.getByText("E-mail inválido")).toBeVisible();
  });

  test("cron recusa chamadas sem o segredo", async ({ request }) => {
    const res = await request.get("/api/cron/recorrencias");
    expect(res.status()).toBe(401);
  });
});
