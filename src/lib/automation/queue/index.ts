import "server-only";
import { registerQueueProvider, getQueueProvider, listRegisteredQueueProviderKeys } from "./registry";
import { PostgresQueueProvider } from "./providers/postgres-queue";
import { MemoryQueueProvider } from "./providers/memory-queue";
import { notYetImplementedQueueProviders } from "./providers/not-yet-implemented-queues";

let registered = false;
const sharedMemoryProvider = new MemoryQueueProvider();

/** Enregistrement idempotent — voir bootstrap.ts (même défensif qu'ADR 0013). */
export function registerBuiltInQueueProviders(): void {
  if (registered) return;
  registered = true;

  registerQueueProvider(new PostgresQueueProvider());
  registerQueueProvider(sharedMemoryProvider);
  for (const provider of notYetImplementedQueueProviders) registerQueueProvider(provider);
}

/** Fournisseur actif, piloté par `QUEUE_PROVIDER` (défaut `"postgres"`) — jamais choisi en dur (même principe que `getActiveLlmProvider`, ADR 0015). */
export function getActiveQueueProvider() {
  registerBuiltInQueueProviders();
  const key = process.env.QUEUE_PROVIDER ?? "postgres";
  const provider = getQueueProvider(key);
  if (!provider) {
    throw new Error(`Fournisseur de file "${key}" inconnu. Fournisseurs enregistrés : ${listRegisteredQueueProviderKeys().join(", ")}.`);
  }
  return provider;
}

export * from "./types";
export * from "./registry";
