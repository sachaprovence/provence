import "server-only";
import type { IntegrationConfigState, IntegrationDiagnosticProvider, IntegrationTestResult } from "../types";
import { withTimeout, DEFAULT_DIAGNOSTIC_TIMEOUT_MS } from "../with-timeout";

/**
 * Diagnostic Stripe (v1.2, AR-0165) — configuration de DÉPLOIEMENT
 * (`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`), jamais par organisation
 * (voir `src/lib/billing/index.ts`) : le test de connexion est donc
 * identique quelle que soit l'organisation appelante. Appel en lecture
 * seule (`GET /v1/balance`, ne modifie rien côté Stripe), même convention
 * `fetch()` direct que `src/lib/billing/providers/stripe.ts` (pas de SDK).
 */
function apiBaseUrl(): string {
  return process.env.STRIPE_API_BASE_URL || "https://api.stripe.com/v1";
}

export async function getStripeConfigState(): Promise<IntegrationConfigState> {
  const hasSecretKey = Boolean(process.env.STRIPE_SECRET_KEY);
  const hasWebhookSecret = Boolean(process.env.STRIPE_WEBHOOK_SECRET);
  if (!hasSecretKey && !hasWebhookSecret) return "NOT_CONFIGURED";
  if (hasSecretKey && hasWebhookSecret) return "CONFIGURED";
  return "PARTIALLY_CONFIGURED";
}

export async function testStripeConnection(): Promise<IntegrationTestResult> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return { status: "TEST_FAILED", message: "STRIPE_SECRET_KEY absente." };

  try {
    const response = await withTimeout(
      fetch(`${apiBaseUrl()}/balance`, { method: "GET", headers: { Authorization: `Bearer ${secretKey}` } }),
      DEFAULT_DIAGNOSTIC_TIMEOUT_MS,
      "Stripe"
    );
    if (response.ok) return { status: "TEST_SUCCESS", message: "Connexion établie (compte Stripe accessible)." };
    if (response.status === 401) return { status: "TEST_FAILED", message: "Authentification refusée par Stripe (401) — clé secrète invalide." };
    return { status: "TEST_FAILED", message: `Stripe a répondu ${response.status}.` };
  } catch (error) {
    if (error instanceof Error && error.name === "DiagnosticTimeoutError") {
      return { status: "UNAVAILABLE", message: error.message };
    }
    return { status: "UNAVAILABLE", message: "Stripe injoignable (erreur réseau)." };
  }
}

export const stripeDiagnosticProvider: IntegrationDiagnosticProvider = {
  key: "STRIPE",
  label: "Stripe (facturation)",
  getConfigState: () => getStripeConfigState(),
  testConnection: () => testStripeConnection(),
};
