import "server-only";
import { logger } from "@/lib/logger";
import type { LockManager } from "./types";

const managers = new Map<string, LockManager>();

export function registerLockManager(manager: LockManager): void {
  if (managers.has(manager.key)) {
    logger.debug({ key: manager.key }, "Gestionnaire de verrous réenregistré (remplace le précédent).");
  }
  managers.set(manager.key, manager);
}

export function getLockManager(key: string): LockManager | undefined {
  return managers.get(key);
}

export function listRegisteredLockManagerKeys(): string[] {
  return Array.from(managers.keys());
}
