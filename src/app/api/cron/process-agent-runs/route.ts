import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/auth";
import { processQueuedAgentRuns } from "@/lib/agents/execution-engine";
import { clearExpiredMemory } from "@/lib/agents/memory";

/**
 * Traitement planifié de la file d'exécution des agents (voir ADR 0008).
 * Même convention que POST /api/cron/process-sequences : déclenchable
 * manuellement (acteur authentifié) ou par un vrai cron système avec
 * l'en-tête `Authorization: Bearer <CRON_SECRET>`.
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    const actor = await getCurrentActor();
    if (!actor) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const results = await processQueuedAgentRuns();
  const expiredMemoryCleared = await clearExpiredMemory();

  return NextResponse.json({
    processed: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok),
    expiredMemoryCleared,
  });
}
