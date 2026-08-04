import "server-only";
import { logger } from "@/lib/logger";
import { refreshGoogleAccessToken } from "@/lib/google/oauth";
import { resolveEmailConfig, configValue } from "../config";
import type { EmailProvider, OutboundEmail, SendResult } from "../types";

const DEFAULT_GMAIL_API_BASE_URL = "https://gmail.googleapis.com/gmail/v1";

function toBase64Url(input: string): string {
  return Buffer.from(input, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Message RFC 2822 minimal (en-têtes + corps HTML), tel qu'attendu par `users.messages.send` (champ `raw`, base64url). */
function buildRawMessage(email: OutboundEmail): string {
  const headers = [
    `From: ${email.fromName} <${email.fromEmail}>`,
    `To: ${email.toEmail}`,
    `Subject: ${email.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
  ].join("\r\n");
  return toBase64Url(`${headers}\r\n\r\n${email.body}`);
}

/**
 * Fournisseur Gmail réel (v0.9 bis, AR-0053) — API Gmail v1
 * (https://developers.google.com/gmail/api/reference/rest/v1/users.messages/send),
 * OAuth2 partagé avec Google Calendar (voir `src/lib/google/oauth.ts`).
 * Configuration par organisation (`Integration.config`, kind EMAIL :
 * `clientId`/`clientSecret`/`refreshToken`, émis par le flux de connexion
 * `/api/email/gmail/connect`), repli sur `GMAIL_OAUTH_CLIENT_ID`/
 * `GMAIL_OAUTH_CLIENT_SECRET`/`GMAIL_REFRESH_TOKEN`. Échoue explicitement
 * si non configuré ou si l'appel réseau échoue — jamais un succès simulé
 * (même convention que `smtp.ts`/`resend.ts`/`postmark.ts`/`brevo.ts`).
 */
export class GmailEmailProvider implements EmailProvider {
  readonly name = "gmail";

  async send(email: OutboundEmail): Promise<SendResult> {
    const config = await resolveEmailConfig(email.organizationId);
    const clientId = configValue(config, "clientId", "GMAIL_OAUTH_CLIENT_ID");
    const clientSecret = configValue(config, "clientSecret", "GMAIL_OAUTH_CLIENT_SECRET");
    const refreshToken = configValue(config, "refreshToken", "GMAIL_REFRESH_TOKEN");

    if (!clientId || !clientSecret || !refreshToken) {
      return {
        providerMessageId: "",
        status: "failed",
        error:
          "Fournisseur Gmail non configuré : clientId/clientSecret/refreshToken requis (Integration.config ou variables d'environnement) — voir Paramètres → Intégrations pour connecter Gmail.",
      };
    }

    const oauthBaseUrl = configValue(config, "oauthBaseUrl", "GMAIL_OAUTH_BASE_URL");
    const apiBaseUrl = configValue(config, "apiBaseUrl", "GMAIL_API_BASE_URL") ?? DEFAULT_GMAIL_API_BASE_URL;

    try {
      const accessToken = await refreshGoogleAccessToken({ clientId, clientSecret, refreshToken, oauthBaseUrl, integrationLabel: "Gmail" });

      const response = await fetch(`${apiBaseUrl}/users/me/messages/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw: buildRawMessage(email) }),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        return { providerMessageId: "", status: "failed", error: `Gmail a répondu ${response.status} : ${errorBody.slice(0, 300)}` };
      }

      const data = (await response.json()) as { id: string };
      return { providerMessageId: data.id, status: "sent" };
    } catch (error) {
      logger.warn({ err: error }, "Échec de l'envoi via Gmail.");
      return { providerMessageId: "", status: "failed", error: error instanceof Error ? error.message : "Erreur réseau." };
    }
  }
}
