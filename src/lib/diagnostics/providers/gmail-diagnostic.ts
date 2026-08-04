import "server-only";
import { refreshGoogleAccessToken } from "@/lib/google/oauth";
import { resolveEmailConfig, configValue } from "@/lib/email/config";
import type { IntegrationConfigState, IntegrationDiagnosticProvider, IntegrationTestResult } from "../types";
import { withTimeout, DEFAULT_DIAGNOSTIC_TIMEOUT_MS } from "../with-timeout";

/**
 * Diagnostic Gmail (v1.2, AR-0165) — le test de connexion réutilise
 * `refreshGoogleAccessToken` (déjà appelé par `providers/gmail.ts` avant
 * tout envoi réel) : un renouvellement de jeton réussi prouve que
 * clientId/clientSecret/refreshToken sont valides, SANS envoyer aucun
 * email (contrairement à un test qui enverrait un message de test).
 */
async function resolveCredentials(organizationId: string) {
  const config = await resolveEmailConfig(organizationId);
  return {
    clientId: configValue(config, "clientId", "GMAIL_OAUTH_CLIENT_ID"),
    clientSecret: configValue(config, "clientSecret", "GMAIL_OAUTH_CLIENT_SECRET"),
    refreshToken: configValue(config, "refreshToken", "GMAIL_REFRESH_TOKEN"),
    oauthBaseUrl: configValue(config, "oauthBaseUrl", "GMAIL_OAUTH_BASE_URL"),
  };
}

export async function getGmailConfigState(organizationId: string): Promise<IntegrationConfigState> {
  const { clientId, clientSecret, refreshToken } = await resolveCredentials(organizationId);
  const presentCount = [clientId, clientSecret, refreshToken].filter(Boolean).length;
  if (presentCount === 0) return "NOT_CONFIGURED";
  if (presentCount === 3) return "CONFIGURED";
  return "PARTIALLY_CONFIGURED";
}

export async function testGmailConnection(organizationId: string): Promise<IntegrationTestResult> {
  const { clientId, clientSecret, refreshToken, oauthBaseUrl } = await resolveCredentials(organizationId);
  if (!clientId || !clientSecret || !refreshToken) {
    return { status: "TEST_FAILED", message: "clientId/clientSecret/refreshToken absents." };
  }

  try {
    await withTimeout(
      refreshGoogleAccessToken({ clientId, clientSecret, refreshToken, oauthBaseUrl, integrationLabel: "Gmail" }),
      DEFAULT_DIAGNOSTIC_TIMEOUT_MS,
      "Gmail"
    );
    return { status: "TEST_SUCCESS", message: "Connexion établie (jeton Gmail renouvelé avec succès)." };
  } catch (error) {
    if (error instanceof Error && error.name === "DiagnosticTimeoutError") {
      return { status: "UNAVAILABLE", message: error.message };
    }
    const message = error instanceof Error ? error.message : "Erreur inconnue.";
    if (/échoué \(4\d\d\)/.test(message)) {
      return { status: "TEST_FAILED", message: "Authentification refusée par Google — identifiants ou jeton de renouvellement invalide." };
    }
    return { status: "UNAVAILABLE", message: "Google injoignable (erreur réseau)." };
  }
}

export const gmailDiagnosticProvider: IntegrationDiagnosticProvider = {
  key: "GMAIL",
  label: "Gmail",
  getConfigState: (organizationId) => getGmailConfigState(organizationId),
  testConnection: (organizationId) => testGmailConnection(organizationId),
};
