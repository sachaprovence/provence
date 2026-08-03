import "server-only";
import { logger } from "@/lib/logger";
import { resolveEmailConfig, configValue } from "../config";
import type { EmailProvider, OutboundEmail, SendResult } from "../types";

/**
 * Fournisseur Resend réel (https://resend.com/docs/api-reference/emails/send-email).
 * Configuration par organisation (`Integration.config.apiKey`), repli sur
 * `RESEND_API_KEY`. Échoue explicitement si aucune clé n'est configurée —
 * voir `smtp.ts` pour la même convention.
 */
export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";

  async send(email: OutboundEmail): Promise<SendResult> {
    const config = await resolveEmailConfig(email.organizationId);
    const apiKey = configValue(config, "apiKey", "RESEND_API_KEY");

    if (!apiKey) {
      return {
        providerMessageId: "",
        status: "failed",
        error: "Fournisseur Resend non configuré : clé API requise (Integration.config.apiKey ou RESEND_API_KEY).",
      };
    }

    const baseUrl = typeof config.baseUrl === "string" && config.baseUrl ? config.baseUrl : "https://api.resend.com/emails";

    try {
      const response = await fetch(baseUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${email.fromName} <${email.fromEmail}>`,
          to: [email.toEmail],
          subject: email.subject,
          html: email.body,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        return { providerMessageId: "", status: "failed", error: `Resend a répondu ${response.status} : ${errorBody.slice(0, 300)}` };
      }

      const data = (await response.json()) as { id: string };
      return { providerMessageId: data.id, status: "sent" };
    } catch (error) {
      logger.warn({ err: error }, "Échec de l'envoi via Resend.");
      return { providerMessageId: "", status: "failed", error: error instanceof Error ? error.message : "Erreur réseau." };
    }
  }
}
