import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/auth";
import { processOverdueInvoices } from "@/lib/jobs/process-overdue-invoices";

/**
 * Bascule planifiée SENT -> OVERDUE (v1.1, AR-0169). Peut être déclenché
 * manuellement (authentifié) ou par un vrai cron système avec l'en-tête
 * `Authorization: Bearer <CRON_SECRET>` — même convention que
 * `POST /api/cron/process-webhook-deliveries`.
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    const actor = await getCurrentActor();
    if (!actor) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const result = await processOverdueInvoices();
  return NextResponse.json(result);
}
