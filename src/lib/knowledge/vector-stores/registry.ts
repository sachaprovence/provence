import "server-only";
import { logger } from "@/lib/logger";
import type { VectorStore } from "./types";

const stores = new Map<string, VectorStore>();

export function registerVectorStore(store: VectorStore): void {
  if (stores.has(store.key)) {
    logger.debug({ key: store.key }, "Base vectorielle réenregistrée (remplace la précédente).");
  }
  stores.set(store.key, store);
}

export function getVectorStore(key: string): VectorStore | undefined {
  return stores.get(key);
}

export function listRegisteredVectorStoreKeys(): string[] {
  return Array.from(stores.keys());
}
