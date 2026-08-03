import "server-only";
import { prisma } from "@/lib/prisma";

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
  [key: string]: unknown;
}

export async function resolveEmailConfig(organizationId: string): Promise<EmailIntegrationConfig> {
  const integration = await prisma.integration.findFirst({ where: { organizationId, kind: "EMAIL" } });
  return (integration?.config as EmailIntegrationConfig | null) ?? {};
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
