import { defineConfig } from "vitest/config";

export default defineConfig({
  // Componentes .tsx nos testes: JSX automático (o tsconfig usa preserve para o Next)
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { alias: { "@": import.meta.dirname } },
  test: { include: ["**/*.test.ts"], exclude: ["node_modules/**", "tests/e2e/**"] },
});
