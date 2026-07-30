import "server-only";
import { logger } from "@/lib/logger";
import type { EmbeddingProvider } from "./types";

const providers = new Map<string, EmbeddingProvider>();

export function registerEmbeddingProvider(provider: EmbeddingProvider): void {
  if (providers.has(provider.key)) {
    logger.debug({ key: provider.key }, "Fournisseur d'embeddings réenregistré (remplace le précédent).");
  }
  providers.set(provider.key, provider);
}

export function getEmbeddingProvider(key: string): EmbeddingProvider | undefined {
  return providers.get(key);
}

export function listRegisteredEmbeddingProviderKeys(): string[] {
  return Array.from(providers.keys());
}
