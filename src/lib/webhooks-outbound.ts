import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { subscribeDomainEvent, type DomainEventPayload } from "@/lib/events/domain-events";
import { logger } from "@/lib/logger";

/**
 * Webhooks sortants (v1.0, AR-0061) — s'abonne directement au bus
 * d'évènements applicatifs déjà existant (`src/lib/events/domain-events.ts`,
 * v0.6), au lieu d'ajouter de nouveaux points de déclenchement dans le
 * code métier : chaque évènement métier réel (prospect créé, devis signé,
 * facture payée) transite déjà par `publishAutomationEvent`
 * (`src/lib/automation/triggers/event-dispatcher.ts`), lui-même appelé
 * par `lead-service`/`quote-service`/`invoice-service` — s'abonner au même
 * bus suffit, sans dupliquer ni modifier ces points d'appel.
 */
export const OUTBOUND_WEBHOOK_EVENT_TYPES = ["lead.created", "quote.signed", "invoice.paid"] as const;
export type OutboundWebhookEventType = (typeof OUTBOUND_WEBHOOK_EVENT_TYPES)[number];

let registered = false;

async function handleOutboundWebhookEvent(eventType: OutboundWebhookEventType, payload: DomainEventPayload): Promise<void> {
  const organizationId = typeof payload.organizationId === "string" ? payload.organizationId : null;
  if (!organizationId) return;

  const subscriptions = await prisma.webhookSubscription.findMany({
    where: { organizationId, isActive: true, eventTypes: { has: eventType } },
  });
  if (subscriptions.length === 0) return;

  await prisma.webhookDelivery.createMany({
    data: subscriptions.map((subscription) => ({
      subscriptionId: subscription.id,
      organizationId,
      eventType,
      payload: payload as never,
      idempotencyKey: crypto.randomUUID(),
    })),
  });

  logger.info(
    { module: "webhooks-outbound", eventType, organizationId, subscriptionCount: subscriptions.length },
    "Livraison(s) de webhook sortant planifiée(s)."
  );
}

/** Idempotent — `subscribeDomainEvent` dédoublonne par référence de fonction (Set), un appel répété ne crée jamais de double abonnement. */
export function registerOutboundWebhookListeners(): void {
  if (registered) return;
  registered = true;
  for (const eventType of OUTBOUND_WEBHOOK_EVENT_TYPES) {
    subscribeDomainEvent(eventType, (payload) => handleOutboundWebhookEvent(eventType, payload));
  }
}
