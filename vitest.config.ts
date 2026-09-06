import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // O pacote real só resolve dentro do bundler do Next; fora dele, o
      // módulo que o importa precisa de um substituto vazio para ser testado.
      "server-only": path.resolve(__dirname, "tests/apoio/server-only.ts"),
    },
  },
});
