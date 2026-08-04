/**
 * Limiteur de débit best-effort par clé (ex. IP + route), en mémoire par
 * processus — même honnêteté documentée que
 * `src/lib/automation/concurrency/rate-limiter.ts` (qui protège des appels
 * SORTANTS vers des API tierces) : pas partagé entre plusieurs instances,
 * limite assumée (v0.10, AR-0155). Protège les endpoints d'authentification
 * sensibles contre un abus scripté basique ; le verrouillage de compte
 * durable (`assertLoginNotLocked`, Postgres via `LoginEvent`) reste la
 * protection réelle contre le brute force cross-instance.
 */
interface Bucket {
  count: number;
  windowStartedAt: number;
}

const buckets = new Map<string, Bucket>();

/** `true` si `key` a dépassé `maxRequests` sur la fenêtre glissante `windowMs`. */
export function isRateLimited(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStartedAt >= windowMs) {
    buckets.set(key, { count: 1, windowStartedAt: now });
    return false;
  }
  bucket.count += 1;
  return bucket.count > maxRequests;
}

/** Utilisé par les tests pour repartir d'un état propre entre deux scénarios. */
export function clearRateLimitBuckets(): void {
  buckets.clear();
}
