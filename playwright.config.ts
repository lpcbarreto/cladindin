import { defineConfig, devices } from "@playwright/test";

/**
 * Testes ponta a ponta. Por padrão sobem o `pnpm dev` local.
 * Os fluxos autenticados só rodam com E2E_EMAIL e E2E_PASSWORD de um usuário de TESTE
 * (nunca use sua conta real), num workspace descartável.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "pnpm dev", url: "http://localhost:3000/login", reuseExistingServer: true, timeout: 120_000 },
});
