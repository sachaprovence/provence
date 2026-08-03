import "server-only";

/**
 * Limiteur de débit à seau de jetons (token bucket), en mémoire par
 * processus — suffisant pour protéger un fournisseur externe (ex. un
 * quota d'API tierce) sans nouvelle dépendance. Un job qui déclare
 * `rateLimitKey` ne peut être exécuté que si un jeton est disponible pour
 * cette clé ; sinon il reste `QUEUED` et sera retenté au prochain tick du
 * Job Executor (voir ADR 0032). Limite assumée : le compteur est par
 * processus, pas partagé entre plusieurs instances — documentée comme
 * limite volontaire (comme le `MemoryQueueProvider`).
 */
class TokenBucket {
  private tokens: number;
  private lastRefillAt: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerMs: number
  ) {
    this.tokens = capacity;
    this.lastRefillAt = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsedMs = now - this.lastRefillAt;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedMs * this.refillPerMs);
    this.lastRefillAt = now;
  }

  tryConsume(count: number = 1): boolean {
    this.refill();
    if (this.tokens < count) return false;
    this.tokens -= count;
    return true;
  }
}

export class RateLimiter {
  private buckets = new Map<string, TokenBucket>();

  /** Configure (ou reconfigure) la limite pour une clé : `tokensPerInterval` jetons rechargés toutes les `intervalMs`. */
  configure(key: string, tokensPerInterval: number, intervalMs: number): void {
    this.buckets.set(key, new TokenBucket(tokensPerInterval, tokensPerInterval / intervalMs));
  }

  /** Aucune limite configurée pour `key` = toujours autorisé (comportement par défaut, non restrictif). */
  tryConsume(key: string, count: number = 1): boolean {
    const bucket = this.buckets.get(key);
    if (!bucket) return true;
    return bucket.tryConsume(count);
  }

  /** Utilisé par les tests pour repartir d'un état propre entre deux scénarios. */
  clear(): void {
    this.buckets.clear();
  }
}

export const sharedRateLimiter = new RateLimiter();
