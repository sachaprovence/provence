import { NextResponse } from "next/server";
import { handleBillingWebhookEvent } from "@/lib/billing/subscription-service";
import { toApiErrorResponse } from "@/lib/errors";

/**
 * Webhook entrant du fournisseur de facturation réel (v1.0, AR-0063) —
 * jamais appelé en mode démo (aucun service externe). Signature vérifiée
 * dans `constructWebhookEvent` (`StripeBillingProvider`), idempotent via
 * `WebhookEvent.externalId`.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  try {
    const result = await handleBillingWebhookEvent(rawBody, signature);
    return NextResponse.json(result);
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/billing/webhook" });
  }
}
