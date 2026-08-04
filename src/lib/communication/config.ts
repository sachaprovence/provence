import "server-only";
import { prisma } from "@/lib/prisma";
import type { CommunicationChannel } from "./types";

/**
 * Configuration réelle des canaux SMS/WhatsApp/Téléphone (v1.1, AR-0170) —
 * même patron que `src/lib/email/config.ts` (`EmailIntegrationConfig`,
 * `resolveEmailConfig`, `configValue`) : lue depuis `Integration.config`
 * (multi-tenant, déjà lu par `hub-service.ts#resolveChannelProvider` pour
 * le CHOIX du fournisseur), avec repli sur des variables d'environnement
 * pour les IDENTIFIANTS eux-mêmes.
 */
export interface ChannelIntegrationConfig {
  provider?: string;
  /** Twilio (v1.1, AR-0170) — un seul compte couvre SMS/WhatsApp/Téléphone. */
  accountSid?: string;
  authToken?: string;
  fromNumber?: string;
  /** Surcharge de l'URL de base de l'API (tests) — jamais utilisée en production. */
  apiBaseUrl?: string;
  [key: string]: unknown;
}

export async function resolveChannelConfig(organizationId: string, channel: CommunicationChannel): Promise<ChannelIntegrationConfig> {
  const integration = await prisma.integration.findFirst({ where: { organizationId, kind: channel } });
  return (integration?.config as ChannelIntegrationConfig | null) ?? {};
}

export function channelConfigValue(config: ChannelIntegrationConfig, configKey: string, envVar: string): string | undefined {
  const fromConfig = config[configKey];
  if (fromConfig !== undefined && fromConfig !== null && fromConfig !== "") return String(fromConfig);
  return process.env[envVar] || undefined;
}
