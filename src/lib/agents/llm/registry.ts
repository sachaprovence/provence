import "server-only";
import { logger } from "@/lib/logger";
import type { LlmProvider } from "./types";

/**
 * Registre en mémoire des fournisseurs LLM (`LlmProvider.key` ->
 * implémentation) — même idiome que `src/lib/agents/registry.ts` /
 * `tool-registry.ts` (v0.3) : `Map.set` idempotent, jamais d'exception sur
 * un réenregistrement (rechargement à chaud). Voir ADR 0013 : tout point
 * d'entrée qui résout un fournisseur doit s'assurer que l'enregistrement a
 * eu lieu dans SON contexte d'exécution (voir `ensureLlmProvidersRegistered`
 * dans `bootstrap.ts`), pas seulement au démarrage du serveur.
 */
const providers = new Map<string, LlmProvider>();

export function registerLlmProvider(provider: LlmProvider) {
  if (providers.has(provider.key)) {
    logger.debug({ providerKey: provider.key }, "Fournisseur LLM réenregistré (remplace le précédent).");
  }
  providers.set(provider.key, provider);
}

export function getLlmProvider(key: string): LlmProvider | undefined {
  return providers.get(key);
}

export function listRegisteredLlmProviderKeys(): string[] {
  return Array.from(providers.keys());
}
