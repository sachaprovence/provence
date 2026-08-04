import type { EmailProvider } from "./types";
import { DemoEmailProvider } from "./demo-provider";
import { SmtpEmailProvider } from "./providers/smtp";
import { ResendEmailProvider } from "./providers/resend";
import { PostmarkEmailProvider } from "./providers/postmark";
import { BrevoEmailProvider } from "./providers/brevo";
import { GmailEmailProvider } from "./providers/gmail";
import { OutlookEmailProvider } from "./providers/outlook";
import { assertEmailQuotaAvailable } from "./quota";
import { resolveEmailConfig } from "./config";

function providerByKind(kind: string): EmailProvider {
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

/**
 * Fournisseur choisi via `EMAIL_PROVIDER` (défaut `"demo"`) — réglage de
 * déploiement GLOBAL, utilisé quand aucune organisation n'a fait son
 * propre choix (voir `getEmailProviderForOrganization`, AR-0171). Les
 * IDENTIFIANTS (clé API, hôte SMTP...) restent résolus PAR ORGANISATION à
 * l'intérieur de chaque fournisseur réel (`../config.ts`,
 * `Integration.config`) — jamais figés dans le code ni partagés
 * globalement, pour un vrai SaaS multi-tenant (ADR 0038).
 */
export function getEmailProvider(): EmailProvider {
  return providerByKind(process.env.EMAIL_PROVIDER ?? "demo");
}

/**
 * Résolution par organisation (v1.1, AR-0171) — privilégie le fournisseur
 * choisi par l'organisation elle-même (`Integration.config.provider`, kind
 * EMAIL, déjà utilisé pour stocker les identifiants — voir Paramètres →
 * Email), avec repli sur `EMAIL_PROVIDER` (déploiement) puis `"demo"`.
 * Permet à deux organisations d'une même instance SaaS d'utiliser des
 * fournisseurs email différents, sans jamais faire disparaître le mode
 * démo par défaut. AUCUNE vérification de quota ici — voir
 * `getEmailProviderForOrganization` (avec quota) et `sequence-engine.ts`
 * (quota vérifié séparément, pour préserver ses effets de bord
 * spécifiques en cas de dépassement).
 */
export async function resolveEmailProviderForOrganization(organizationId: string): Promise<EmailProvider> {
  const config = await resolveEmailConfig(organizationId);
  const kind = config.provider || process.env.EMAIL_PROVIDER || "demo";
  return providerByKind(kind);
}

/**
 * Même chose que `resolveEmailProviderForOrganization()`, mais vérifie
 * d'abord le quota email quotidien de l'organisation (AR-0057,
 * `src/lib/email/quota.ts`) — lève `QuotaExceededError` si dépassé. À
 * utiliser à chaque point d'appel réel connaissant l'organisation
 * concernée (Automation Engine, Workflow Engine).
 */
export async function getEmailProviderForOrganization(organizationId: string): Promise<EmailProvider> {
  await assertEmailQuotaAvailable(organizationId);
  return resolveEmailProviderForOrganization(organizationId);
}

export * from "./types";
export { assertEmailQuotaAvailable, getEmailSentTodayCount, resolveDailyEmailLimit } from "./quota";
