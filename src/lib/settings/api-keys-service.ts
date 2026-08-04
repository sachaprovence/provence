import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { generateApiKey } from "@/lib/public-api/auth";

/** Aperçu sans secret pour l'UI/API — jamais la clé en clair après sa création initiale. */
export interface ApiKeyPreview {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

function toPreview(apiKey: {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}): ApiKeyPreview {
  return {
    id: apiKey.id,
    name: apiKey.name,
    keyPrefix: apiKey.keyPrefix,
    scopes: apiKey.scopes,
    lastUsedAt: apiKey.lastUsedAt,
    revokedAt: apiKey.revokedAt,
    createdAt: apiKey.createdAt,
  };
}

export async function listApiKeys(organizationId: string): Promise<ApiKeyPreview[]> {
  const apiKeys = await prisma.apiKey.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
  return apiKeys.map(toPreview);
}

/** Crée une nouvelle clé API — la valeur en clair n'est renvoyée qu'une seule fois, ici, jamais relisible ensuite. */
export async function createApiKey(params: { organizationId: string; name: string; createdById: string }): Promise<{ rawKey: string; preview: ApiKeyPreview }> {
  if (!params.name.trim()) {
    throw new ValidationError('Un nom est requis pour identifier la clé API (ex. "Intégration comptabilité").');
  }
  const { rawKey, keyPrefix, hashedKey } = generateApiKey();
  const apiKey = await prisma.apiKey.create({
    data: { organizationId: params.organizationId, name: params.name.trim(), keyPrefix, hashedKey, createdById: params.createdById },
  });
  return { rawKey, preview: toPreview(apiKey) };
}

export async function revokeApiKey(organizationId: string, apiKeyId: string): Promise<void> {
  const apiKey = await prisma.apiKey.findFirst({ where: { id: apiKeyId, organizationId } });
  if (!apiKey) throw new NotFoundError("Clé API introuvable.");
  await prisma.apiKey.update({ where: { id: apiKey.id }, data: { revokedAt: new Date() } });
}
