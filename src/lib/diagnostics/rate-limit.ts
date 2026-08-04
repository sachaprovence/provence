import "server-only";
import { isRateLimited } from "@/lib/security/rate-limiter";
import { TooManyRequestsError } from "@/lib/errors";

/**
 * Limitation des tests de connexion manuels (v1.2, AR-0165) — réutilise le
 * limiteur best-effort existant (`src/lib/security/rate-limiter.ts`, v0.10
 * AR-0155), même honnêteté documentée (en mémoire par processus). Protège
 * à la fois contre un abus de l'écran de diagnostic ET contre un appel
 * excessif aux API tierces réelles (Stripe/Twilio/Gmail/Outlook/S3)
 * déclenché par ce diagnostic.
 */
const MAX_TESTS_PER_WINDOW = 5;
const WINDOW_MS = 5 * 60_000;

/** Lève `TooManyRequestsError` (429) si cette organisation a trop testé cette intégration récemment. */
export function assertDiagnosticTestRateLimitAvailable(organizationId: string, integration: string): void {
  if (isRateLimited(`integration-diagnostic:${organizationId}:${integration}`, MAX_TESTS_PER_WINDOW, WINDOW_MS)) {
    throw new TooManyRequestsError(
      `Trop de tests de connexion pour cette intégration (limite : ${MAX_TESTS_PER_WINDOW} tests / 5 minutes). Réessayez dans quelques minutes.`
    );
  }
}
