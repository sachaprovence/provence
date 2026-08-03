import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { generateToken } from "@/lib/auth";
import { OUTBOUND_WEBHOOK_EVENT_TYPES, type OutboundWebhookEventType } from "@/lib/webhooks-outbound";

/** Aperçu sans secret pour l'UI/API. */
export interface WebhookSubscriptionPreview {
  id: string;
  url: string;
  eventTypes: string[];
  isActive: boolean;
  createdAt: Date;
}

function toPreview(subscription: { id: string; url: string; eventTypes: string[]; isActive: boolean; createdAt: Date }): WebhookSubscriptionPreview {
  return { id: subscription.id, url: subscription.url, eventTypes: subscription.eventTypes, isActive: subscription.isActive, createdAt: subscription.createdAt };
}

export async function listWebhookSubscriptions(organizationId: string): Promise<WebhookSubscriptionPreview[]> {
  const subscriptions = await prisma.webhookSubscription.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
  return subscriptions.map(toPreview);
}

/** Crée une souscription — le secret HMAC est TOUJOURS généré automatiquement, jamais optionnel (même principe que `ensureWebhookTriggerConfig`, v0.10 AR-0156). */
export async function createWebhookSubscription(params: {
  organizationId: string;
  url: string;
  eventTypes: string[];
  createdById: string;
}): Promise<{ secret: string; preview: WebhookSubscriptionPreview }> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(params.url);
  } catch {
    throw new ValidationError("URL invalide.");
  }
  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new ValidationError("L'URL doit utiliser http(s).");
  }
  const validEventTypes = params.eventTypes.filter((e): e is OutboundWebhookEventType =>
    (OUTBOUND_WEBHOOK_EVENT_TYPES as readonly string[]).includes(e)
  );
  if (validEventTypes.length === 0) {
    throw new ValidationError(`Au moins un type d'évènement valide est requis parmi : ${OUTBOUND_WEBHOOK_EVENT_TYPES.join(", ")}.`);
  }

  const secret = generateToken();
  const subscription = await prisma.webhookSubscription.create({
    data: { organizationId: params.organizationId, url: params.url, eventTypes: validEventTypes, secret, createdById: params.createdById },
  });
  return { secret, preview: toPreview(subscription) };
}

export async function deleteWebhookSubscription(organizationId: string, subscriptionId: string): Promise<void> {
  const subscription = await prisma.webhookSubscription.findFirst({ where: { id: subscriptionId, organizationId } });
  if (!subscription) throw new NotFoundError("Souscription webhook introuvable.");
  await prisma.webhookSubscription.delete({ where: { id: subscription.id } });
}
