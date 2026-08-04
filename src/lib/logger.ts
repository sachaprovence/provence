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
/**
 * v1.2, AR-0168 : liste étendue après audit des noms de champs RÉELLEMENT
 * utilisés dans le code pour porter un secret (`refreshToken`/`accessToken`
 * OAuth Gmail/Outlook, `clientSecret` OAuth, `authToken` Twilio,
 * `secretAccessKey` S3, `smtpPassword`, `apiKey` fournisseurs email) —
 * `token`/`secret`/`password`/`authSecret` seuls ne couvraient QUE les
 * clés exactement nommées ainsi, jamais `refreshToken`/`clientSecret`
 * etc. (pino compare le nom de clé littéralement, pas par sous-chaîne).
 * Voir tests/observability/logger.test.ts pour la preuve, par test, que
 * chacun de ces champs est réellement masqué — jamais une simple
 * affirmation en commentaire.
 */
const REDACTED_PATHS = [
  "password",
  "*.password",
  "passwordHash",
  "*.passwordHash",
  "token",
  "*.token",
  "refreshToken",
  "*.refreshToken",
  "accessToken",
  "*.accessToken",
  "clientSecret",
  "*.clientSecret",
  "authToken",
  "*.authToken",
  "apiKey",
  "*.apiKey",
  "smtpPassword",
  "*.smtpPassword",
  "secretAccessKey",
  "*.secretAccessKey",
  "authSecret",
  "*.authSecret",
  "secret",
  "*.secret",
  "authorization",
  "*.authorization",
  "cookie",
  "*.cookie",
  "req.headers.authorization",
  "req.headers.cookie",
];

/** Exportée uniquement pour permettre à un test de reconstruire un pino avec la même politique de redaction contre une destination capturable (voir tests/observability/logger.test.ts) — jamais utilisée ailleurs. */
export const LOGGER_OPTIONS = {
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  redact: { paths: REDACTED_PATHS, censor: "[REDACTED]" },
  base: { app: "autorun" },
  timestamp: pino.stdTimeFunctions.isoTime,
};

export const logger = pino(LOGGER_OPTIONS);

/** Logger dédié à un module (`logger.child({ module: "sequence-engine" })`). */
export function createModuleLogger(moduleName: string) {
  return logger.child({ module: moduleName });
}
