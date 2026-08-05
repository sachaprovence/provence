import "server-only";
import { z } from "zod";

/**
 * Schéma de validation des variables d'environnement serveur.
 *
 * Volontairement strict sur les secrets (longueur minimale) : une valeur par
 * défaut faible en développement doit rester détectable, pas silencieusement
 * acceptée. La validation est déclenchée au démarrage du serveur par
 * `src/instrumentation.ts` (fonction `register`), jamais au moment du build
 * (`next build`) — voir ADR 0002.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL est requis (URL de connexion PostgreSQL)."),

  AUTH_SECRET: z
    .string()
    .min(16, "AUTH_SECRET doit contenir au moins 16 caractères (utilisé pour signer les liens sensibles)."),

  AI_PROVIDER: z.string().default("demo"),
  EMAIL_PROVIDER: z.string().default("demo"),
  STORAGE_PROVIDER: z.string().default("demo"),

  NEXT_PUBLIC_APP_URL: z
    .string()
    .url("NEXT_PUBLIC_APP_URL doit être une URL absolue (ex. https://app.example.com).")
    .default("http://localhost:3000"),

  CRON_SECRET: z.string().optional(),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  // Compta Vellano — sous-fonctionnalités pas encore livrées (voir src/app/(app)/compta/scanner
  // et .../assistant) : réglage de déploiement, jamais un `if (vertical === ...)` en dur.
  // `z.coerce.boolean()` n'est PAS utilisé ici volontairement : une variable d'env est toujours
  // une string, et Boolean("false") vaut `true` — seule la string exacte "true" active le flag.
  COMPTA_OCR_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  COMPTA_AI_ASSISTANT_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(racine)"}: ${issue.message}`)
    .join("\n");
}

/**
 * Valide `process.env` et met le résultat en cache. Lève une erreur explicite
 * (liste des variables en cause) au premier appel invalide, plutôt que de
 * laisser l'application démarrer avec une configuration incomplète.
 */
export function loadEnv(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Configuration d'environnement invalide :\n${formatIssues(parsed.error)}\n\n` +
        "Vérifiez votre fichier .env (voir .env.example)."
    );
  }
  cached = parsed.data;
  return cached;
}

/**
 * Accès paresseux aux variables d'environnement validées : la validation ne
 * se déclenche qu'à la première lecture réelle d'une propriété, jamais à
 * l'import du module. Cela permet d'importer `env` en toute sécurité depuis
 * n'importe quel module serveur (y compris ceux évalués pendant
 * `next build`) sans exiger que toutes les variables soient déjà présentes à
 * ce moment-là — seul le premier accès effectif (au runtime) est bloquant.
 */
export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string) {
    return loadEnv()[prop as keyof Env];
  },
}) as Env;
