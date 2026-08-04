import crypto from "node:crypto";

/**
 * Garde-fous purs (sans effet de bord) pour AR-0163 — extraits dans un
 * module séparé pour être testables unitairement (`tests/scripts/
 * temp-db-guardrails.test.ts`) indépendamment du script d'orchestration
 * (`scripts/test-migrations-fresh-db.ts`, qui a un `main()` exécuté au
 * chargement et ne doit donc jamais être importé directement).
 */

export const TEMP_DB_NAME_PATTERN = /^autorun_migtest_\d{10,}_[0-9a-f]{8}$/;

export class UnsafeTempDbNameError extends Error {}

/** Nom de base de données réellement utilisé par l'application, extrait de `DATABASE_URL`. */
export function realAppDbName(databaseUrl: string): string {
  return new URL(databaseUrl).pathname.replace(/^\//, "");
}

export function generateTempDbName(): string {
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString("hex");
  return `autorun_migtest_${timestamp}_${random}`;
}

/**
 * Garde-fou central — DOIT être appelé avant toute opération destructive
 * (CREATE DATABASE en amont par prudence, DROP DATABASE en aval de façon
 * impérative). Lève une exception plutôt que de retourner un booléen :
 * un appelant ne peut pas "oublier" de vérifier le résultat.
 */
export function assertSafeTempDbName(name: string, realDbName: string): void {
  if (!TEMP_DB_NAME_PATTERN.test(name)) {
    throw new UnsafeTempDbNameError(
      `"${name}" ne respecte pas le format temporaire attendu (${TEMP_DB_NAME_PATTERN}) — opération refusée.`
    );
  }
  if (name === realDbName) {
    throw new UnsafeTempDbNameError(
      `"${name}" correspond au nom de la base applicative réelle (${realDbName}) — opération refusée.`
    );
  }
}

export function adminConnectionUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.pathname = "/postgres";
  return url.toString();
}

export function tempConnectionUrl(databaseUrl: string, tempDbName: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${tempDbName}`;
  return url.toString();
}

/**
 * `DATABASE_URL` porte `?schema=public` (v1.2, AR-0166) — une extension
 * propre à Prisma (`search_path` côté client Prisma), qu'aucun outil natif
 * libpq (`pg_dump`, `pg_restore`, `psql`) ne reconnaît comme paramètre de
 * connexion valide (`invalid URI query parameter: "schema"`). Ce nom de
 * schéma reste toujours `public` en pratique dans ce projet (jamais
 * configuré autrement) : le retirer avant de passer l'URL à un outil natif
 * ne change donc rien au comportement réel, seulement à ce que l'outil
 * accepte de parser.
 */
export function pgToolConnectionUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.searchParams.delete("schema");
  return url.toString();
}
