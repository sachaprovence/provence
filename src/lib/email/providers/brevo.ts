import "server-only";
import { logger } from "@/lib/logger";
import { resolveEmailConfig, configValue } from "../config";
import type { EmailProvider, OutboundEmail, SendResult } from "../types";

/**
 * Fournisseur Brevo (ex-Sendinblue) réel
 * (https://developers.brevo.com/reference/sendtransacemail). Configuration
 * par organisation (`Integration.config.apiKey`), repli sur `BREVO_API_KEY`.
 */
export class BrevoEmailProvider implements EmailProvider {
  readonly name = "brevo";

  async send(email: OutboundEmail): Promise<SendResult> {
    const config = await resolveEmailConfig(email.organizationId);
    const apiKey = configValue(config, "apiKey", "BREVO_API_KEY");

    if (!apiKey) {
      return {
        providerMessageId: "",
        status: "failed",
        error: "Fournisseur Brevo non configuré : clé API requise (Integration.config.apiKey ou BREVO_API_KEY).",
      };
    }

    const baseUrl = typeof config.baseUrl === "string" && config.baseUrl ? config.baseUrl : "https://api.brevo.com/v3/smtp/email";

    try {
      const response = await fetch(baseUrl, {
        method: "POST",
        headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          sender: { name: email.fromName, email: email.fromEmail },
          to: [{ email: email.toEmail }],
          subject: email.subject,
          htmlContent: email.body,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        return { providerMessageId: "", status: "failed", error: `Brevo a répondu ${response.status} : ${errorBody.slice(0, 300)}` };
      }

      const data = (await response.json()) as { messageId: string };
      return { providerMessageId: data.messageId, status: "sent" };
    } catch (error) {
      logger.warn({ err: error }, "Échec de l'envoi via Brevo.");
      return { providerMessageId: "", status: "failed", error: error instanceof Error ? error.message : "Erreur réseau." };
    }
  }
}
