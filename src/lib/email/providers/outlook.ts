import "server-only";
import { logger } from "@/lib/logger";
import { refreshMicrosoftAccessToken } from "@/lib/microsoft/oauth";
import { resolveEmailConfig, configValue } from "../config";
import type { EmailProvider, OutboundEmail, SendResult } from "../types";

const DEFAULT_GRAPH_API_BASE_URL = "https://graph.microsoft.com/v1.0";
/** `offline_access` requis pour obtenir un `refresh_token` (sinon Microsoft n'en renvoie aucun). */
export const OUTLOOK_SEND_SCOPE = "https://graph.microsoft.com/Mail.Send offline_access";

/**
 * Fournisseur Outlook réel (v0.9 bis, AR-0054) — Microsoft Graph
 * (`POST /me/sendMail`, https://learn.microsoft.com/en-us/graph/api/user-sendmail),
 * OAuth2 (voir `src/lib/microsoft/oauth.ts`, même patron que Gmail/AR-0053
 * pour Google). Configuration par organisation (`Integration.config`, kind
 * EMAIL : `clientId`/`clientSecret`/`refreshToken`/`tenantId`, émis par le
 * flux de connexion `/api/email/outlook/connect`), repli sur
 * `MICROSOFT_OAUTH_CLIENT_ID`/`MICROSOFT_OAUTH_CLIENT_SECRET`/
 * `MICROSOFT_REFRESH_TOKEN`/`MICROSOFT_TENANT_ID`. Échoue explicitement si
 * non configuré ou si l'appel réseau échoue — jamais un succès simulé
 * (même convention que les autres fournisseurs email réels).
 */
export class OutlookEmailProvider implements EmailProvider {
  readonly name = "outlook";

  async send(email: OutboundEmail): Promise<SendResult> {
    const config = await resolveEmailConfig(email.organizationId);
    const clientId = configValue(config, "clientId", "MICROSOFT_OAUTH_CLIENT_ID");
    const clientSecret = configValue(config, "clientSecret", "MICROSOFT_OAUTH_CLIENT_SECRET");
    const refreshToken = configValue(config, "refreshToken", "MICROSOFT_REFRESH_TOKEN");

    if (!clientId || !clientSecret || !refreshToken) {
      return {
        providerMessageId: "",
        status: "failed",
        error:
          "Fournisseur Outlook non configuré : clientId/clientSecret/refreshToken requis (Integration.config ou variables d'environnement) — voir Paramètres → Intégrations pour connecter Outlook.",
      };
    }

    const tenant = configValue(config, "tenantId", "MICROSOFT_TENANT_ID");
    const authBaseUrl = configValue(config, "oauthBaseUrl", "MICROSOFT_OAUTH_BASE_URL");
    const apiBaseUrl = configValue(config, "apiBaseUrl", "MICROSOFT_GRAPH_API_BASE_URL") ?? DEFAULT_GRAPH_API_BASE_URL;

    try {
      const accessToken = await refreshMicrosoftAccessToken({
        clientId,
        clientSecret,
        refreshToken,
        scope: OUTLOOK_SEND_SCOPE,
        tenant,
        authBaseUrl,
        integrationLabel: "Outlook",
      });

      const response = await fetch(`${apiBaseUrl}/me/sendMail`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            subject: email.subject,
            body: { contentType: "HTML", content: email.body },
            from: { emailAddress: { address: email.fromEmail, name: email.fromName } },
            toRecipients: [{ emailAddress: { address: email.toEmail } }],
          },
          saveToSentItems: true,
        }),
      });

      // sendMail répond 202 Accepted sans corps, sans identifiant de message exploitable — voir Microsoft Graph docs.
      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        return { providerMessageId: "", status: "failed", error: `Outlook a répondu ${response.status} : ${errorBody.slice(0, 300)}` };
      }

      return { providerMessageId: response.headers.get("request-id") ?? "sent", status: "sent" };
    } catch (error) {
      logger.warn({ err: error }, "Échec de l'envoi via Outlook.");
      return { providerMessageId: "", status: "failed", error: error instanceof Error ? error.message : "Erreur réseau." };
    }
  }
}
