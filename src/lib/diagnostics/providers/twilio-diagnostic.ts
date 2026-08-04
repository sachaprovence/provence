import "server-only";
import { resolveChannelConfig, channelConfigValue } from "@/lib/communication/config";
import type { IntegrationConfigState, IntegrationDiagnosticProvider, IntegrationTestResult } from "../types";
import { withTimeout, DEFAULT_DIAGNOSTIC_TIMEOUT_MS } from "../with-timeout";

/**
 * Diagnostic Twilio (v1.2, AR-0165) — un seul compte Twilio couvre
 * SMS/WhatsApp/Téléphone (voir `src/lib/communication/providers/
 * twilio-client.ts`), donc le diagnostic se fonde sur le canal `SMS`
 * (convention déjà adoptée par la page Paramètres). Test de connexion en
 * lecture seule (`GET /Accounts/{Sid}.json`, ne modifie rien côté Twilio,
 * n'envoie ni SMS ni appel) — `twilioApiRequest` existant est POST
 * uniquement (envoi de message/appel), donc un appel `fetch()` dédié est
 * utilisé ici plutôt que de le détourner de son usage réel.
 */
const DEFAULT_TWILIO_API_BASE_URL = "https://api.twilio.com/2010-04-01";

async function resolveCredentials(organizationId: string) {
  const config = await resolveChannelConfig(organizationId, "SMS");
  return {
    accountSid: channelConfigValue(config, "accountSid", "TWILIO_ACCOUNT_SID"),
    authToken: channelConfigValue(config, "authToken", "TWILIO_AUTH_TOKEN"),
    apiBaseUrl: channelConfigValue(config, "apiBaseUrl", "TWILIO_API_BASE_URL") ?? DEFAULT_TWILIO_API_BASE_URL,
  };
}

export async function getTwilioConfigState(organizationId: string): Promise<IntegrationConfigState> {
  const { accountSid, authToken } = await resolveCredentials(organizationId);
  if (!accountSid && !authToken) return "NOT_CONFIGURED";
  if (accountSid && authToken) return "CONFIGURED";
  return "PARTIALLY_CONFIGURED";
}

export async function testTwilioConnection(organizationId: string): Promise<IntegrationTestResult> {
  const { accountSid, authToken, apiBaseUrl } = await resolveCredentials(organizationId);
  if (!accountSid || !authToken) return { status: "TEST_FAILED", message: "accountSid/authToken absents." };

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  try {
    const response = await withTimeout(
      fetch(`${apiBaseUrl}/Accounts/${accountSid}.json`, { method: "GET", headers: { Authorization: `Basic ${auth}` } }),
      DEFAULT_DIAGNOSTIC_TIMEOUT_MS,
      "Twilio"
    );
    if (response.ok) return { status: "TEST_SUCCESS", message: "Connexion établie (compte Twilio accessible)." };
    if (response.status === 401) return { status: "TEST_FAILED", message: "Authentification refusée par Twilio (401) — identifiants invalides." };
    return { status: "TEST_FAILED", message: `Twilio a répondu ${response.status}.` };
  } catch (error) {
    if (error instanceof Error && error.name === "DiagnosticTimeoutError") {
      return { status: "UNAVAILABLE", message: error.message };
    }
    return { status: "UNAVAILABLE", message: "Twilio injoignable (erreur réseau)." };
  }
}

export const twilioDiagnosticProvider: IntegrationDiagnosticProvider = {
  key: "TWILIO",
  label: "Twilio (SMS / WhatsApp / Téléphone)",
  getConfigState: (organizationId) => getTwilioConfigState(organizationId),
  testConnection: (organizationId) => testTwilioConnection(organizationId),
};
