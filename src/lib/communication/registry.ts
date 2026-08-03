import "server-only";
import { logger } from "@/lib/logger";
import type { CommunicationChannel, CommunicationChannelProvider } from "./types";

/**
 * Registre en mémoire des fournisseurs du Communication Hub — même idiome
 * que `src/lib/agents/llm/registry.ts` (v0.5) : clé composite
 * `channel:providerKey`, `Map.set` idempotent, jamais d'exception sur un
 * réenregistrement (rechargement à chaud).
 */
const providers = new Map<string, CommunicationChannelProvider>();

function compositeKey(channel: CommunicationChannel, key: string) {
  return `${channel}:${key}`;
}

export function registerCommunicationProvider(provider: CommunicationChannelProvider) {
  const id = compositeKey(provider.channel, provider.key);
  if (providers.has(id)) {
    logger.debug({ channel: provider.channel, providerKey: provider.key }, "Fournisseur de communication réenregistré (remplace le précédent).");
  }
  providers.set(id, provider);
}

export function getCommunicationProvider(channel: CommunicationChannel, key: string): CommunicationChannelProvider | undefined {
  return providers.get(compositeKey(channel, key));
}

export function listRegisteredCommunicationProviderKeys(channel: CommunicationChannel): string[] {
  const prefix = `${channel}:`;
  return Array.from(providers.keys())
    .filter((id) => id.startsWith(prefix))
    .map((id) => id.slice(prefix.length));
}
