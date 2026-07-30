import { notFound } from "next/navigation";
import { requireWorkspaceActor } from "@/lib/workspace-context";
import { hasWorkspacePermission } from "@/lib/workspace-permissions";
import { getAutomationRunDetail } from "@/lib/automation/registry/automation-service";
import { NotFoundError } from "@/lib/errors";
import { AutomationRunDetailClient } from "@/components/automation-run-detail-client";

export default async function AutomationRunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const actor = await requireWorkspaceActor();

  if (!hasWorkspacePermission(actor.workspace.role, "VIEW_WORKSPACE")) {
    return (
      <div className="max-w-3xl">
        <p className="text-sm text-p360-danger">Vous n&apos;avez pas la permission de consulter cette exécution.</p>
      </div>
    );
  }

  let detail;
  try {
    detail = await getAutomationRunDetail(actor, runId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const { run, jobs, logs } = detail;

  return (
    <div className="max-w-5xl">
      <AutomationRunDetailClient
        runId={run.id}
        automationId={run.automationId}
        automationName={run.automation.name}
        status={run.status}
        trigger={run.trigger}
        input={run.input}
        output={run.output}
        error={run.error}
        jobs={jobs.map((j) => ({
          id: j.id,
          nodeId: j.nodeId,
          jobType: j.jobType,
          status: j.status,
          attempt: j.attempt,
          maxAttempts: j.maxAttempts,
          output: j.output,
          error: j.error,
          startedAt: j.startedAt?.toISOString() ?? null,
          finishedAt: j.finishedAt?.toISOString() ?? null,
          durationMs: j.durationMs,
        }))}
        logs={logs.map((l) => ({
          id: l.id,
          nodeId: l.nodeId,
          level: l.level,
          message: l.message,
          metadata: l.metadata,
          createdAt: l.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
