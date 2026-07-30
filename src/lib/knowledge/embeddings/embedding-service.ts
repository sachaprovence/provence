import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getActiveEmbeddingProvider } from "./index";

/**
 * Couche de service au-dessus du registre de fournisseurs : cache en
 * mémoire (évite de re-vectoriser un texte identique), journal et coût
 * estimé (`EmbeddingRequest`, un par appel), versionnage implicite (le
 * modèle utilisé est toujours retourné et propagé jusqu'à
 * `KnowledgeChunk.embeddingModel` — jamais de comparaison entre vecteurs
 * de modèles différents).
 */
const cache = new Map<string, number[]>();

function cacheKey(provider: string, model: string, text: string): string {
  return `${provider}:${model}:${crypto.createHash("sha256").update(text).digest("hex")}`;
}

/** Coût approximatif par 1000 tokens (USD) — heuristique de tarification publique, pas une facturation exacte. */
const COST_PER_1K_TOKENS_USD: Record<string, number> = {
  demo: 0,
  openai: 0.00002,
  voyageai: 0.00002,
  jina: 0.00002,
  cohere: 0.0001,
  nomic: 0.00001,
  ollama: 0,
  huggingface: 0,
};

function estimateCostUsd(providerKey: string, texts: string[]): number {
  const totalChars = texts.reduce((sum, t) => sum + t.length, 0);
  const approxTokens = totalChars / 4; // heuristique grossière caractères → tokens, comme ailleurs dans le projet (voir stats.ts)
  const rate = COST_PER_1K_TOKENS_USD[providerKey] ?? 0;
  return (approxTokens / 1000) * rate;
}

export async function embedTexts(params: {
  organizationId: string;
  workspaceId?: string;
  texts: string[];
  model?: string;
}): Promise<{ vectors: number[][]; provider: string; model: string; dimensions: number }> {
  if (params.texts.length === 0) {
    return { vectors: [], provider: getActiveEmbeddingProvider().key, model: params.model ?? "", dimensions: 0 };
  }

  const provider = getActiveEmbeddingProvider();
  const model = params.model ?? provider.defaultModel;

  const vectors: (number[] | null)[] = params.texts.map((text) => cache.get(cacheKey(provider.key, model, text)) ?? null);
  const missingIndexes = vectors.reduce<number[]>((acc, v, i) => (v === null ? [...acc, i] : acc), []);

  let dimensions = vectors.find((v): v is number[] => v !== null)?.length ?? 0;

  if (missingIndexes.length > 0) {
    const result = await provider.embed(
      missingIndexes.map((i) => params.texts[i]),
      params.model
    );
    dimensions = result.dimensions;
    missingIndexes.forEach((originalIndex, resultIndex) => {
      const vector = result.vectors[resultIndex];
      vectors[originalIndex] = vector;
      cache.set(cacheKey(provider.key, model, params.texts[originalIndex]), vector);
    });
  }

  const textsActuallyEmbedded = missingIndexes.map((i) => params.texts[i]);
  await prisma.embeddingRequest.create({
    data: {
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      provider: provider.key,
      model,
      inputCount: params.texts.length,
      dimensions,
      estimatedCostUsd: estimateCostUsd(provider.key, textsActuallyEmbedded),
      cached: missingIndexes.length === 0,
    },
  });

  return { vectors: vectors as number[][], provider: provider.key, model, dimensions };
}

/** Utilisé par les tests pour repartir d'un cache propre entre deux scénarios. */
export function clearEmbeddingCache(): void {
  cache.clear();
}
