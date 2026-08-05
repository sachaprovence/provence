import "server-only";
import { prisma } from "@/lib/prisma";
import { assertConnectorLimitAvailable } from "@/lib/billing/quota-enforcement";

/**
 * Configuration réelle d'envoi d'email (brief v0.9 : "Supprimer
 * progressivement le fonctionnement démo") — lue depuis `Integration.config`
 * (stockage multi-tenant par organisation, jusqu'ici jamais lu par aucun
 * fournisseur réel), avec repli sur des variables d'environnement pour un
 * déploiement mono-organisation/démo (voir ADR 0038). Chaque clé de
 * `EmailIntegrationConfig` est spécifique à UN fournisseur ; un fournisseur
 * ignore les clés des autres.
 */
export interface EmailIntegrationConfig {
  /**
   * Fournisseur actif de l'organisation (v1.1, AR-0171) — prime sur la
   * variable d'environnement globale `EMAIL_PROVIDER` quand renseigné (voir
   * `getEmailProviderForOrganization`). Absent par défaut : le déploiement
   * garde son comportement historique (un seul fournisseur pour toutes les
   * organisations) tant qu'aucune organisation n'a fait ce choix.
   */
  provider?: string;
  /** SMTP */
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  smtpSecure?: boolean;
  /** Resend / Postmark / Brevo */
  apiKey?: string;
  /** Surcharge de l'URL de base de l'API (tests, passerelle d'entreprise auto-hébergée). */
  baseUrl?: string;
  /** Gmail (AR-0053) / Outlook (AR-0054) — OAuth2, émis par le flux de connexion (voir Paramètres → Intégrations). */
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  /** Outlook (AR-0054) uniquement — "common" par défaut (comptes personnels ET professionnels/scolaires), sinon l'identifiant du tenant Azure AD de l'organisation. */
  tenantId?: string;
  /** Surcharges pour les tests (jamais utilisées en production) — endpoint d'échange/renouvellement de jeton. */
  oauthBaseUrl?: string;
  /** Surcharge pour les tests — endpoint de l'API d'envoi (Gmail/Microsoft Graph). */
  apiBaseUrl?: string;
  [key: string]: unknown;
}

export async function resolveEmailConfig(organizationId: string): Promise<EmailIntegrationConfig> {
  const integration = await prisma.integration.findFirst({ where: { organizationId, kind: "EMAIL" } });
  return (integration?.config as EmailIntegrationConfig | null) ?? {};
}

/**
 * Réglages (task #92) : fusionne les champs fournis dans la configuration
 * existante — un champ secret (`smtpPassword`/`apiKey`) laissé vide dans le
 * formulaire ne doit jamais effacer un identifiant déjà enregistré. Marque
 * l'intégration `CONNECTED` (visible dans la liste des intégrations), même
 * principe que `communication/hub-service.ts#updateChannelConfig`.
 */
export async function updateEmailIntegrationConfig(
  organizationId: string,
  data: Partial<EmailIntegrationConfig>
): Promise<void> {
  const existing = await prisma.integration.findFirst({ where: { organizationId, kind: "EMAIL" } });
  const previous = (existing?.config as EmailIntegrationConfig | null) ?? {};
  const merged: EmailIntegrationConfig = { ...previous };
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === "") continue;
    merged[key] = value;
  }

  if (existing) {
    await prisma.integration.update({ where: { id: existing.id }, data: { config: merged as never, status: "CONNECTED" } });
    return;
  }
  await assertConnectorLimitAvailable(organizationId, "EMAIL");
  await prisma.integration.create({ data: { organizationId, kind: "EMAIL", name: "Email", status: "CONNECTED", config: merged as never } });
}

/** Aperçu SANS secrets pour l'UI (jamais renvoyer `smtpPassword`/`apiKey` en clair au navigateur) — indique seulement si un secret est déjà enregistré. */
export async function getEmailConfigPreview(organizationId: string) {
  const config = await resolveEmailConfig(organizationId);
  return {
    provider: typeof config.provider === "string" ? config.provider : "",
    smtpHost: typeof config.smtpHost === "string" ? config.smtpHost : "",
    smtpPort: typeof config.smtpPort === "number" ? config.smtpPort : undefined,
    smtpUser: typeof config.smtpUser === "string" ? config.smtpUser : "",
    smtpSecure: Boolean(config.smtpSecure),
    hasSmtpPassword: Boolean(config.smtpPassword),
    hasApiKey: Boolean(config.apiKey),
  };
}

/**
 * Valeur de config par-organisation si présente, sinon variable
 * d'environnement, sinon `undefined`. Accepte les valeurs non-string du
 * JSON (`smtpPort` est un nombre, `smtpSecure` un booléen) — toujours
 * renvoyée en string, à convertir par l'appelant si besoin (voir `Number()`
 * dans `providers/smtp.ts`).
 */
export function configValue(config: EmailIntegrationConfig, configKey: string, envVar: string): string | undefined {
  const fromConfig = config[configKey];
  if (fromConfig !== undefined && fromConfig !== null && fromConfig !== "") return String(fromConfig);
  return process.env[envVar] || undefined;
}
