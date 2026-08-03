import "server-only";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit";
import { registerBuiltInCommunicationProviders } from "./bootstrap";
import { getCommunicationProvider, listRegisteredCommunicationProviderKeys } from "./registry";
import type { CommunicationChannel, OutboundCommunication, CommunicationSendResult } from "./types";

/**
 * Point d'entrée unique du Communication Hub (brief v0.9 : "Centre de
 * communication unifié") — résout le fournisseur ACTIF pour un canal et
 * une organisation donnés à partir d'`Integration.config` (stockage
 * multi-tenant déjà existant, jusqu'ici jamais lu par aucun fournisseur
 * réel — voir ADR 0038), avec repli sur un fournisseur par défaut si
 * l'organisation n'a rien configuré.
 */

const DEFAULT_PROVIDER_KEY: Record<CommunicationChannel, string> = {
  SMS: "demo",
  WHATSAPP: "demo",
  PHONE: "demo",
  WEBHOOK: "http",
};

interface IntegrationConfig {
  provider?: string;
  [key: string]: unknown;
}

export async function resolveChannelProvider(organizationId: string, channel: CommunicationChannel) {
  registerBuiltInCommunicationProviders();

  const integration = await prisma.integration.findFirst({ where: { organizationId, kind: channel } });
  const config = (integration?.config as IntegrationConfig | null) ?? null;
  const providerKey = config?.provider ?? DEFAULT_PROVIDER_KEY[channel];

  const provider = getCommunicationProvider(channel, providerKey);
  if (!provider) {
    throw new ValidationError(
      `Fournisseur "${providerKey}" inconnu pour le canal ${channel}. Fournisseurs enregistrés : ${listRegisteredCommunicationProviderKeys(channel).join(", ")}.`
    );
  }
  return provider;
}

const CHANNEL_DEFAULT_NAME: Record<CommunicationChannel, string> = {
  SMS: "SMS",
  WHATSAPP: "WhatsApp",
  PHONE: "Téléphone",
  WEBHOOK: "Webhooks sortants",
};

/** Configure le fournisseur actif d'un canal pour une organisation (brief v0.9 : réglages SMS/agenda/IA...). */
export async function updateChannelConfig(
  organizationId: string,
  channel: CommunicationChannel,
  data: { provider: string; config?: Record<string, unknown> }
) {
  const existing = await prisma.integration.findFirst({ where: { organizationId, kind: channel } });
  const config = { ...(data.config ?? {}), provider: data.provider };

  if (existing) {
    return prisma.integration.update({
      where: { id: existing.id },
      data: { config, status: "CONNECTED" },
    });
  }

  return prisma.integration.create({
    data: { organizationId, kind: channel, name: CHANNEL_DEFAULT_NAME[channel], status: "CONNECTED", config },
  });
}

export async function sendCommunication(
  organizationId: string,
  channel: CommunicationChannel,
  message: Omit<OutboundCommunication, "organizationId">
): Promise<CommunicationSendResult> {
  const provider = await resolveChannelProvider(organizationId, channel);
  const result = await provider.send({ organizationId, ...message });

  await writeAuditLog({
    organizationId,
    action: `communication.${channel.toLowerCase()}.${result.status}`,
    entityType: "CommunicationMessage",
    metadata: { channel, provider: provider.key, to: message.to, externalId: result.externalId, error: result.error },
  });

  return result;
}
