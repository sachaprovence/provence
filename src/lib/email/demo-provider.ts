import crypto from "node:crypto";
import type { EmailProvider, OutboundEmail, SendResult } from "./types";

/**
 * Fournisseur email simulé : n'effectue aucun envoi réseau réel. Les emails
 * sont considérés "envoyés" et restent consultables dans la boîte de
 * réception in-app (table Message/Conversation). Pour brancher un vrai
 * fournisseur (SMTP, Gmail API, Outlook API), implémenter `EmailProvider`
 * dans un nouveau fichier et l'enregistrer dans `getEmailProvider`.
 */
export class DemoEmailProvider implements EmailProvider {
  readonly name = "demo";

  async send(email: OutboundEmail): Promise<SendResult> {
    const looksInvalid = /invalid|bounce/i.test(email.toEmail);
    if (looksInvalid) {
      return { providerMessageId: crypto.randomUUID(), status: "failed", error: "Adresse invalide (simulation)" };
    }
    return { providerMessageId: crypto.randomUUID(), status: "sent" };
  }
}
