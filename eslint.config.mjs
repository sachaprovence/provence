import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettierConfig from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Portée limitée à l'application (`src/`) : les scripts autonomes
    // (`prisma/seed.ts`, `tests/e2e/*.mjs`) impriment légitimement leur
    // progression sur la sortie standard, ce n'est pas du code serveur de
    // l'application.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      // `console.log`/`console.debug`/`console.info` bruts sont interdits dans
      // `src/` : utiliser le logger structuré (`src/lib/logger.ts`) côté
      // serveur. `console.warn`/`console.error` restent autorisés — c'est le
      // pattern documenté par Next.js lui-même pour les error boundaries
      // client (`error.tsx`, `global-error.tsx`), où le logger serveur n'est
      // pas accessible (voir DEVELOPMENT_GUIDE.md §4).
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  // Doit rester en dernier : désactive les règles de style ESLint qui
  // entreraient en conflit avec le formatage automatique de Prettier.
  prettierConfig,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Généré par Prisma, jamais édité à la main.
    "src/generated/**",
  ]),
]);

export default eslintConfig;
