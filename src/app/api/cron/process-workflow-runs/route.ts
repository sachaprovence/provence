import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/auth";
import { processQueuedWorkflowRuns, processDueWorkflowWaits } from "@/lib/workflows/execution-engine";
import { processDueWorkflowCronTriggers } from "@/lib/workflows/trigger-engine";

/**
 * Traitement planifié du Workflow Engine : runs en file d'attente, runs en
 * attente (`WAITING`) dont le délai est écoulé, et évaluation des
 * déclencheurs cron actifs — même convention que
 * POST /api/cron/process-agent-runs (voir ADR 0008, réappliquée en v0.6).
 * Suppose un appel au plus une fois par minute (voir `triggers/cron.ts`).
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    const actor = await getCurrentActor();
    if (!actor) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const queued = await processQueuedWorkflowRuns();
  const resumed = await processDueWorkflowWaits();
  const cron = await processDueWorkflowCronTriggers();

  return NextResponse.json({
    queued: { processed: queued.length, succeeded: queued.filter((r) => r.ok).length, failed: queued.filter((r) => !r.ok) },
    resumed: { processed: resumed.length, succeeded: resumed.filter((r) => r.ok).length, failed: resumed.filter((r) => !r.ok) },
    cronTriggered: cron.triggered,
  });
}
