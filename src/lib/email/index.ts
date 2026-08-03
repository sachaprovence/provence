import type { EmailProvider } from "./types";
import { DemoEmailProvider } from "./demo-provider";
import { SmtpEmailProvider } from "./providers/smtp";
import { ResendEmailProvider } from "./providers/resend";
import { PostmarkEmailProvider } from "./providers/postmark";
import { BrevoEmailProvider } from "./providers/brevo";
import { GmailEmailProvider } from "./providers/gmail";
import { OutlookEmailProvider } from "./providers/outlook";

/**
 * Fournisseur actif, choisi via `EMAIL_PROVIDER` (défaut `"demo"`) — même
 * convention que `getActiveLlmProvider` (ADR 0015) : le CHOIX du
 * fournisseur est un réglage de déploiement (variable d'environnement),
 * mais les IDENTIFIANTS (clé API, hôte SMTP...) sont résolus PAR
 * ORGANISATION à l'intérieur de chaque fournisseur réel (voir
 * `../config.ts`, `Integration.config`) — jamais figés dans le code ni
 * partagés globalement, pour un vrai SaaS multi-tenant (ADR 0038).
 */
export function getEmailProvider(): EmailProvider {
  const kind = process.env.EMAIL_PROVIDER ?? "demo";
  switch (kind) {
    case "smtp":
      return new SmtpEmailProvider();
    case "resend":
      return new ResendEmailProvider();
    case "postmark":
      return new PostmarkEmailProvider();
    case "brevo":
      return new BrevoEmailProvider();
    case "gmail":
      return new GmailEmailProvider();
    case "outlook":
      return new OutlookEmailProvider();
    case "demo":
    default:
      return new DemoEmailProvider();
  }
}

export * from "./types";
