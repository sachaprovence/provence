import "server-only";
import crypto from "node:crypto";
import { ValidationError } from "@/lib/errors";
import { getEmailProviderForOrganization } from "@/lib/email";
import type { AutomationJobHandler } from "../registry";

type EmailSendInput = { fromName: string; fromEmail: string; toEmail: string; subject: string; body: string };

/** Réutilise l'abstraction email existante (`src/lib/email`), même principe que `workflows/actions/builtin/email-action.ts`. */
export const emailSendAction: AutomationJobHandler<EmailSendInput, { providerMessageId: string; status: string }> = {
  key: "email.send",
  name: "Envoyer un email",
  description: "Envoie un email via le fournisseur email configuré (voir src/lib/email).",
  category: "communication",
  async execute(input, context) {
    if (!input.toEmail || !input.subject) {
      throw new ValidationError('Le job "email.send" nécessite "toEmail" et "subject".');
    }
    const provider = await getEmailProviderForOrganization(context.organizationId);
    const result = await provider.send({
      fromName: input.fromName,
      fromEmail: input.fromEmail,
      toEmail: input.toEmail,
      subject: input.subject,
      body: input.body,
      organizationId: context.organizationId,
      messageId: `automation-job:${context.jobId}:${crypto.randomUUID()}`,
    });
    await context.log("info", `Email envoyé à "${input.toEmail}" via "${provider.name}".`, { status: result.status });
    return result;
  },
};
