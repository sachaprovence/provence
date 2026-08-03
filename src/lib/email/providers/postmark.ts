import "server-only";
import { logger } from "@/lib/logger";
import { resolveEmailConfig, configValue } from "../config";
import type { EmailProvider, OutboundEmail, SendResult } from "../types";

/**
 * Fournisseur Postmark réel (https://postmarkapp.com/developer/api/email-api).
 * Configuration par organisation (`Integration.config.apiKey`), repli sur
 * `POSTMARK_SERVER_TOKEN`.
 */
export class PostmarkEmailProvider implements EmailProvider {
  readonly name = "postmark";

  async send(email: OutboundEmail): Promise<SendResult> {
    const config = await resolveEmailConfig(email.organizationId);
    const token = configValue(config, "apiKey", "POSTMARK_SERVER_TOKEN");

    if (!token) {
      return {
        providerMessageId: "",
        status: "failed",
        error: "Fournisseur Postmark non configuré : jeton serveur requis (Integration.config.apiKey ou POSTMARK_SERVER_TOKEN).",
      };
    }

    const baseUrl = typeof config.baseUrl === "string" && config.baseUrl ? config.baseUrl : "https://api.postmarkapp.com/email";

    try {
      const response = await fetch(baseUrl, {
        method: "POST",
        headers: { "X-Postmark-Server-Token": token, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          From: `${email.fromName} <${email.fromEmail}>`,
          To: email.toEmail,
          Subject: email.subject,
          HtmlBody: email.body,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        return { providerMessageId: "", status: "failed", error: `Postmark a répondu ${response.status} : ${errorBody.slice(0, 300)}` };
      }

      const data = (await response.json()) as { MessageID: string };
      return { providerMessageId: data.MessageID, status: "sent" };
    } catch (error) {
      logger.warn({ err: error }, "Échec de l'envoi via Postmark.");
      return { providerMessageId: "", status: "failed", error: error instanceof Error ? error.message : "Erreur réseau." };
    }
  }
}
