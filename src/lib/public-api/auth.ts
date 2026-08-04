import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { UnauthorizedError } from "@/lib/errors";

/**
 * Authentification de l'API publique par clé API (v1.0, AR-0059) — seul le
 * hash SHA-256 de la clé est conservé en base, jamais la valeur en clair
 * (même principe que `passwordHash`) : `hashApiKey` est déterministe (pas
 * de sel par clé), ce qui permet une recherche directe par égalité de hash
 * plutôt qu'une comparaison une par une de toutes les clés existantes.
 */
export interface PublicApiActor {
  organizationId: string;
  apiKeyId: string;
  scopes: string[];
}

const API_KEY_PREFIX = "ak_live_";

export function hashApiKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

/** Génère une nouvelle clé API — la valeur en clair (`rawKey`) n'est jamais persistée, seul l'appelant la reçoit, une seule fois. */
export function generateApiKey(): { rawKey: string; keyPrefix: string; hashedKey: string } {
  const rawKey = `${API_KEY_PREFIX}${crypto.randomBytes(24).toString("hex")}`;
  return { rawKey, keyPrefix: rawKey.slice(0, API_KEY_PREFIX.length + 8), hashedKey: hashApiKey(rawKey) };
}

/** Résout l'organisation propriétaire de la clé API portée par l'en-tête `Authorization: Bearer <clé>` — échoue explicitement (401) si absente, invalide, ou révoquée. */
export async function resolvePublicApiActor(request: Request): Promise<PublicApiActor> {
  const authHeader = request.headers.get("authorization");
  const rawKey = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;
  if (!rawKey) {
    throw new UnauthorizedError('Clé API manquante (en-tête "Authorization: Bearer <clé>").');
  }

  const apiKey = await prisma.apiKey.findUnique({ where: { hashedKey: hashApiKey(rawKey) } });
  if (!apiKey || apiKey.revokedAt) {
    throw new UnauthorizedError("Clé API invalide ou révoquée.");
  }

  await prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } });

  return { organizationId: apiKey.organizationId, apiKeyId: apiKey.id, scopes: apiKey.scopes };
}
