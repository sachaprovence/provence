import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { decideRetry, DEFAULT_RETRY_POLICY } from "@/lib/automation/retry/retry-engine";
import { logger } from "@/lib/logger";
import { WebhookDeliveryStatus } from "@/generated/prisma/enums";

/**
 * Traitement des livraisons de webhooks sortants (v1.0, AR-0061) — même
 * politique de retry (exponentielle, bornée) que l'Automation Engine
 * (`src/lib/automation/retry/retry-engine.ts`, v0.8), réutilisée telle
 * quelle plutôt que réimplémentée.
 */
const WEBHOOK_RETRY_POLICY = DEFAULT_RETRY_POLICY;

function signPayload(secret: string, idempotencyKey: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(`${idempotencyKey}.${body}`).digest("hex");
}

async function attemptDelivery(delivery: {
  id: string;
  idempotencyKey: string;
  eventType: string;
  payload: unknown;
  attempts: number;
  createdAt: Date;
  subscription: { url: string; secret: string };
}): Promise<{ ok: boolean; responseStatus?: number; error?: string }> {
  const body = JSON.stringify({ eventType: delivery.eventType, data: delivery.payload });
  const signature = signPayload(delivery.subscription.secret, delivery.idempotencyKey, body);

  try {
    const response = await fetch(delivery.subscription.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Autorun-Event": delivery.eventType,
        "X-Autorun-Delivery-Id": delivery.idempotencyKey,
        "X-Autorun-Signature": signature,
      },
      body,
    });
    return { ok: response.ok, responseStatus: response.status };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Traite toutes les livraisons dues (nouvelles ou en nouvelle tentative planifiée). Retourne le nombre traité, réussi, échoué définitivement. */
export async function processDueWebhookDeliveries(now: Date = new Date()) {
  const due = await prisma.webhookDelivery.findMany({
    where: {
      status: WebhookDeliveryStatus.PENDING,
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
    },
    include: { subscription: true },
    take: 100,
  });

  let succeeded = 0;
  let failedPermanently = 0;
  let retried = 0;

  for (const delivery of due) {
    const attempt = delivery.attempts + 1;
    const result = await attemptDelivery(delivery);

    if (result.ok) {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: WebhookDeliveryStatus.SUCCESS, attempts: attempt, responseStatus: result.responseStatus, deliveredAt: now },
      });
      succeeded += 1;
      continue;
    }

    const decision = decideRetry({
      policy: WEBHOOK_RETRY_POLICY,
      attempt,
      error: { message: result.error ?? `HTTP ${result.responseStatus}` },
      firstAttemptAt: delivery.createdAt,
      now,
    });

    if (decision.shouldRetry) {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          attempts: attempt,
          responseStatus: result.responseStatus,
          lastError: result.error ?? `HTTP ${result.responseStatus}`,
          nextRetryAt: new Date(now.getTime() + decision.delayMs),
        },
      });
      retried += 1;
    } else {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: WebhookDeliveryStatus.FAILED,
          attempts: attempt,
          responseStatus: result.responseStatus,
          lastError: result.error ?? `HTTP ${result.responseStatus}`,
        },
      });
      failedPermanently += 1;
      logger.warn(
        { module: "webhook-delivery", deliveryId: delivery.id, subscriptionId: delivery.subscriptionId, attempts: attempt },
        "Livraison de webhook sortant définitivement en échec (nombre maximal de tentatives atteint)."
      );
    }
  }

  return { processed: due.length, succeeded, retried, failedPermanently };
}
