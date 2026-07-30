import "server-only";
import { logger } from "@/lib/logger";
import type { QueueProvider } from "./types";

const providers = new Map<string, QueueProvider>();

export function registerQueueProvider(provider: QueueProvider): void {
  if (providers.has(provider.key)) {
    logger.debug({ key: provider.key }, "Fournisseur de file réenregistré (remplace le précédent).");
  }
  providers.set(provider.key, provider);
}

export function getQueueProvider(key: string): QueueProvider | undefined {
  return providers.get(key);
}

export function listRegisteredQueueProviderKeys(): string[] {
  return Array.from(providers.keys());
}
