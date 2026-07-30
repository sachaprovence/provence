import "server-only";

/**
 * Lock Manager (Automation Engine, v0.8) : verrou par bail (lease) sur une
 * clé arbitraire (`concurrencyKey`/`lockKey` d'un `AutomationJob`, ou toute
 * autre clé métier — ex. "un seul job à la fois par prospect"). Un bail
 * expire automatiquement (`leaseMs`) : un worker qui plante en tenant un
 * verrou ne le retient jamais indéfiniment — voir ADR 0032.
 */
export interface LockManager {
  readonly key: string;
  /** Acquiert le verrou (idempotent si déjà tenu par le même `holderId`). */
  tryAcquire(params: { lockKey: string; holderId: string; leaseMs: number }): Promise<boolean>;
  /** Prolonge le bail d'un verrou déjà tenu par `holderId` — renvoie `false` si le verrou n'est plus tenu par lui. */
  renew(params: { lockKey: string; holderId: string; leaseMs: number }): Promise<boolean>;
  /** Libère le verrou — sans effet si `holderId` ne le tient pas (jamais de libération d'un verrou d'autrui). */
  release(params: { lockKey: string; holderId: string }): Promise<void>;
}
