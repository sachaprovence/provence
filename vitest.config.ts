import { defineConfig } from "vitest/config";
import { loadEnvConfig } from "@next/env";
import path from "node:path";

// Vitest ne charge pas automatiquement les fichiers .env comme le fait le
// runtime Next.js — on réutilise le même chargeur (`@next/env`) que
// Next.js pour que `DATABASE_URL`/`AUTH_SECRET`/etc. soient disponibles
// dans les tests (ex. tests/tenant-isolation/**) sans les redéfinir.
loadEnvConfig(process.cwd());

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./tests/mocks/server-only-stub.ts"),
    },
  },
});
