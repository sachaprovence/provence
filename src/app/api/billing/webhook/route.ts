import { NextResponse } from "next/server";
import { handleBillingWebhookEvent } from "@/lib/billing/subscription-service";
import { toApiErrorResponse } from "@/lib/errors";
import { getRequestId } from "@/lib/observability/request-id";

/**
 * Webhook entrant du fournisseur de facturation réel (v1.0, AR-0063) —
 * jamais appelé en mode démo (aucun service externe). Signature vérifiée
 * dans `constructWebhookEvent` (`StripeBillingProvider`), idempotent via
 * `WebhookEvent.externalId`. `requestId` (v1.2, AR-0168) dans le contexte
 * journalisé : un échec de paiement remonté par un client peut être relié
 * à cette exécution précise via l'en-tête `X-Request-Id` de la réponse.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  try {
    const result = await handleBillingWebhookEvent(rawBody, signature);
    return NextResponse.json(result);
  } catch (error) {
    return toApiErrorResponse(error, { route: "POST /api/billing/webhook", requestId: getRequestId(request) });
  }
}
