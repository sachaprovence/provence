import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/auth";
import { processDueWebhookDeliveries } from "@/lib/jobs/webhook-delivery-job";

/**
 * Traitement planifié des livraisons de webhooks sortants (v1.0, AR-0061).
 * Peut être déclenché manuellement (authentifié) ou par un vrai cron
 * système avec l'en-tête `Authorization: Bearer <CRON_SECRET>` — même
 * convention que `POST /api/cron/process-sequences`.
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    const actor = await getCurrentActor();
    if (!actor) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const result = await processDueWebhookDeliveries();
  return NextResponse.json(result);
}
