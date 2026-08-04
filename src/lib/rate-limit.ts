import "server-only";
import { isRateLimited } from "@/lib/security/rate-limiter";
import { TooManyRequestsError } from "@/lib/errors";

/**
 * Limitation de débit de l'API publique par clé API (v1.0, AR-0060) —
 * réutilise le limiteur best-effort en mémoire déjà existant
 * (`src/lib/security/rate-limiter.ts`, v0.10 AR-0155) plutôt que d'en
 * réimplémenter un second : même honnêteté documentée (non partagé entre
 * plusieurs instances).
 */
const PUBLIC_API_MAX_REQUESTS_PER_MINUTE = 60;
const PUBLIC_API_WINDOW_MS = 60_000;

/** Lève `TooManyRequestsError` (429) si cette clé API a dépassé son débit. */
export function assertPublicApiRateLimitAvailable(apiKeyId: string): void {
  if (isRateLimited(`public-api:${apiKeyId}`, PUBLIC_API_MAX_REQUESTS_PER_MINUTE, PUBLIC_API_WINDOW_MS)) {
    throw new TooManyRequestsError(
      `Débit de l'API publique dépassé (limite : ${PUBLIC_API_MAX_REQUESTS_PER_MINUTE} requêtes/minute par clé). Réessayez dans une minute.`
    );
  }
}
