import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/auth";
import { registerBuiltInAutomationComponents } from "@/lib/automation/bootstrap";
import { processQueuedAutomationRuns, processDueAutomationRunWaits, processAutomationJobs } from "@/lib/automation/executor";
import { processDueAutomationSchedules } from "@/lib/automation/trigger-engine";

/**
 * Traitement planifié de l'Automation Engine : runs `QUEUED` prêts à
 * démarrer, runs `WAITING` dont le délai est écoulé, déclencheurs cron
 * actifs, et le worker du noyau de jobs (réclame + exécute un lot via le
 * Queue Manager) — même convention que `POST /api/cron/process-workflow-runs`
 * (voir ADR 0008, réappliquée en v0.8). Suppose un appel au plus une fois
 * par minute (voir `scheduler/schedule-engine.ts`).
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    const actor = await getCurrentActor();
    if (!actor) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  registerBuiltInAutomationComponents();

  const queuedRuns = await processQueuedAutomationRuns();
  const resumedRuns = await processDueAutomationRunWaits();
  const scheduled = await processDueAutomationSchedules();
  const jobs = await processAutomationJobs();

  return NextResponse.json({
    queuedRuns: { processed: queuedRuns.length, succeeded: queuedRuns.filter((r) => r.ok).length, failed: queuedRuns.filter((r) => !r.ok) },
    resumedRuns: { processed: resumedRuns.length, succeeded: resumedRuns.filter((r) => r.ok).length, failed: resumedRuns.filter((r) => !r.ok) },
    scheduledTriggered: scheduled.triggered,
    jobs,
  });
}
