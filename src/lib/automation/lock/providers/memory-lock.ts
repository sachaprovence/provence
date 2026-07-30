import "server-only";
import type { LockManager } from "../types";

/**
 * Verrou en mémoire (par processus) — pour un déploiement mono-instance ou
 * les tests. Ne coordonne jamais plusieurs processus/instances : voir
 * `postgres-lock.ts` (le défaut) pour un verrou correct à l'échelle du
 * cluster.
 */
export class MemoryLockManager implements LockManager {
  readonly key = "memory";
  private locks = new Map<string, { holderId: string; expiresAt: number }>();

  async tryAcquire(params: { lockKey: string; holderId: string; leaseMs: number }): Promise<boolean> {
    const existing = this.locks.get(params.lockKey);
    const now = Date.now();
    if (existing && existing.expiresAt > now && existing.holderId !== params.holderId) return false;
    this.locks.set(params.lockKey, { holderId: params.holderId, expiresAt: now + params.leaseMs });
    return true;
  }

  async renew(params: { lockKey: string; holderId: string; leaseMs: number }): Promise<boolean> {
    const existing = this.locks.get(params.lockKey);
    if (!existing || existing.holderId !== params.holderId) return false;
    existing.expiresAt = Date.now() + params.leaseMs;
    return true;
  }

  async release(params: { lockKey: string; holderId: string }): Promise<void> {
    const existing = this.locks.get(params.lockKey);
    if (existing && existing.holderId === params.holderId) this.locks.delete(params.lockKey);
  }

  /** Utilisé par les tests pour repartir d'un état propre entre deux scénarios. */
  clear(): void {
    this.locks.clear();
  }
}
