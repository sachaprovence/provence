import "server-only";
import crypto from "node:crypto";
import { ValidationError } from "@/lib/errors";
import { getEmailProviderForOrganization } from "@/lib/email";
import type { WorkflowActionHandler } from "../registry";

type EmailSendInput = { fromName: string; fromEmail: string; toEmail: string; subject: string; body: string };

/**
 * Réutilise l'abstraction email existante (`src/lib/email`, provider
 * "demo" par défaut) plutôt que d'en recréer une. `OutboundEmail.messageId`
 * référence normalement un `Message` de Provence 360 (séquences/
 * campagnes) — un workflow générique n'en a pas forcément un, donc un
 * identifiant synthétique est généré ici (`workflow-run:<runId>:<nodeId>`)
 * pour rester traçable sans forcer la création d'un `Message`.
 */
export const emailSendAction: WorkflowActionHandler<EmailSendInput, { providerMessageId: string; status: string }> = {
  key: "email.send",
  name: "Envoyer un email",
  description: "Envoie un email via le fournisseur email configuré (voir src/lib/email).",
  category: "communication",
  async execute(input, context) {
    if (!input.toEmail || !input.subject) {
      throw new ValidationError('L\'action "email.send" nécessite "toEmail" et "subject".');
    }
    const provider = await getEmailProviderForOrganization(context.organizationId);
    const result = await provider.send({
      fromName: input.fromName,
      fromEmail: input.fromEmail,
      toEmail: input.toEmail,
      subject: input.subject,
      body: input.body,
      organizationId: context.organizationId,
      messageId: `workflow-run:${context.runId}:${context.nodeId}:${crypto.randomUUID()}`,
    });
    await context.log("info", `Email envoyé à "${input.toEmail}" via "${provider.name}".`, { status: result.status });
    return result;
  },
};
