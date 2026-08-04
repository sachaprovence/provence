import "server-only";
import { refreshMicrosoftAccessToken } from "@/lib/microsoft/oauth";
import { resolveEmailConfig, configValue } from "@/lib/email/config";
import { OUTLOOK_SEND_SCOPE } from "@/lib/email/providers/outlook";
import type { IntegrationConfigState, IntegrationDiagnosticProvider, IntegrationTestResult } from "../types";
import { withTimeout, DEFAULT_DIAGNOSTIC_TIMEOUT_MS } from "../with-timeout";

/**
 * Diagnostic Outlook (v1.2, AR-0165) — même principe que Gmail : un
 * renouvellement de jeton Microsoft réussi (`refreshMicrosoftAccessToken`)
 * prouve la validité des identifiants SANS envoyer aucun email. Réutilise
 * le même `scope` que l'envoi réel (`OUTLOOK_SEND_SCOPE`) pour que le test
 * couvre exactement les permissions dont l'envoi a besoin.
 */
async function resolveCredentials(organizationId: string) {
  const config = await resolveEmailConfig(organizationId);
  return {
    clientId: configValue(config, "clientId", "MICROSOFT_OAUTH_CLIENT_ID"),
    clientSecret: configValue(config, "clientSecret", "MICROSOFT_OAUTH_CLIENT_SECRET"),
    refreshToken: configValue(config, "refreshToken", "MICROSOFT_REFRESH_TOKEN"),
    tenant: configValue(config, "tenantId", "MICROSOFT_TENANT_ID"),
    authBaseUrl: configValue(config, "oauthBaseUrl", "MICROSOFT_OAUTH_BASE_URL"),
  };
}

export async function getOutlookConfigState(organizationId: string): Promise<IntegrationConfigState> {
  const { clientId, clientSecret, refreshToken } = await resolveCredentials(organizationId);
  const presentCount = [clientId, clientSecret, refreshToken].filter(Boolean).length;
  if (presentCount === 0) return "NOT_CONFIGURED";
  if (presentCount === 3) return "CONFIGURED";
  return "PARTIALLY_CONFIGURED";
}

export async function testOutlookConnection(organizationId: string): Promise<IntegrationTestResult> {
  const { clientId, clientSecret, refreshToken, tenant, authBaseUrl } = await resolveCredentials(organizationId);
  if (!clientId || !clientSecret || !refreshToken) {
    return { status: "TEST_FAILED", message: "clientId/clientSecret/refreshToken absents." };
  }

  try {
    await withTimeout(
      refreshMicrosoftAccessToken({
        clientId,
        clientSecret,
        refreshToken,
        scope: OUTLOOK_SEND_SCOPE,
        tenant,
        authBaseUrl,
        integrationLabel: "Outlook",
      }),
      DEFAULT_DIAGNOSTIC_TIMEOUT_MS,
      "Outlook"
    );
    return { status: "TEST_SUCCESS", message: "Connexion établie (jeton Outlook renouvelé avec succès)." };
  } catch (error) {
    if (error instanceof Error && error.name === "DiagnosticTimeoutError") {
      return { status: "UNAVAILABLE", message: error.message };
    }
    const message = error instanceof Error ? error.message : "Erreur inconnue.";
    if (/échoué \(4\d\d\)/.test(message)) {
      return { status: "TEST_FAILED", message: "Authentification refusée par Microsoft — identifiants ou jeton de renouvellement invalide." };
    }
    return { status: "UNAVAILABLE", message: "Microsoft injoignable (erreur réseau)." };
  }
}

export const outlookDiagnosticProvider: IntegrationDiagnosticProvider = {
  key: "OUTLOOK",
  label: "Outlook",
  getConfigState: (organizationId) => getOutlookConfigState(organizationId),
  testConnection: (organizationId) => testOutlookConnection(organizationId),
};
