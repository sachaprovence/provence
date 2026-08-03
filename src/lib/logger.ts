import "server-only";
import pino from "pino";

/**
 * Logger structuré (JSON) pour le code serveur. Remplace `console.*` dans
 * `src/lib` et les Route Handlers — voir DEVELOPMENT_GUIDE.md §4.
 *
 * Pas de transport `pino-pretty` ici volontairement : un transport pino
 * démarre un worker thread séparé, ce qui se comporte mal une fois empaqueté
 * par le bundler serveur de Next.js. La sortie reste du JSON structuré même
 * en développement (lisible avec `npm run dev | npx pino-pretty` si besoin en
 * local) — voir ADR 0003.
 *
 * Champs jamais journalisés en clair (mots de passe, tokens, secrets) via
 * `redact` : toute clé d'objet nommée ainsi, à n'importe quel niveau de
 * profondeur, est automatiquement masquée.
 */
const REDACTED_PATHS = [
  "password",
  "*.password",
  "passwordHash",
  "*.passwordHash",
  "token",
  "*.token",
  "authSecret",
  "*.authSecret",
  "secret",
  "*.secret",
  "authorization",
  "*.authorization",
  "req.headers.authorization",
  "req.headers.cookie",
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  redact: { paths: REDACTED_PATHS, censor: "[REDACTED]" },
  base: { app: "autorun" },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/** Logger dédié à un module (`logger.child({ module: "sequence-engine" })`). */
export function createModuleLogger(moduleName: string) {
  return logger.child({ module: moduleName });
}
