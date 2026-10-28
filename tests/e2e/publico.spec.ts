import { expect, test } from "@playwright/test";

test.describe("sem login", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("tela de login com marca, abas e tema", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Entrar", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Criar conta" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Link mágico" })).toBeVisible();
    await page.getByRole("radio", { name: "Escuro" }).first().click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.getByRole("radio", { name: "Claro" }).first().click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("cadastro exige aceite dos Termos e da Política", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Criar conta" }).first().click();
    const accept = page.getByRole("checkbox", { name: /Li e aceito os Termos de Serviço/ });
    await expect(accept).toBeVisible();
    await expect(accept).not.toBeChecked();
    await expect(page.getByRole("link", { name: "Termos de Serviço" }).first()).toHaveAttribute("href", "/termos");
  });

  test("páginas legais públicas com dados do responsável e rodapé", async ({ page }) => {
    for (const path of ["/termos", "/privacidade", "/cookies", "/reembolso", "/lgpd", "/acessibilidade"]) {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Documentos legais" })).toBeVisible();
    }
  });

  test("aviso de cookies aparece uma vez", async ({ page }) => {
    await page.goto("/termos");
    const notice = page.getByRole("region", { name: "Aviso de cookies" });
    await expect(notice).toBeVisible();
    await notice.getByRole("button", { name: "Entendi" }).click();
    await page.reload();
    await expect(notice).toBeHidden();
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
