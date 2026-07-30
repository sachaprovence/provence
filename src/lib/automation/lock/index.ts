import "server-only";
import { registerLockManager, getLockManager, listRegisteredLockManagerKeys } from "./registry";
import { PostgresLockManager } from "./providers/postgres-lock";
import { MemoryLockManager } from "./providers/memory-lock";

let registered = false;
const sharedMemoryManager = new MemoryLockManager();

export function registerBuiltInLockManagers(): void {
  if (registered) return;
  registered = true;

  registerLockManager(new PostgresLockManager());
  registerLockManager(sharedMemoryManager);
}

/** Gestionnaire actif, piloté par `LOCK_MANAGER` (défaut `"postgres"`). */
export function getActiveLockManager() {
  registerBuiltInLockManagers();
  const key = process.env.LOCK_MANAGER ?? "postgres";
  const manager = getLockManager(key);
  if (!manager) {
    throw new Error(`Gestionnaire de verrous "${key}" inconnu. Enregistrés : ${listRegisteredLockManagerKeys().join(", ")}.`);
  }
  return manager;
}

export * from "./types";
export * from "./registry";
