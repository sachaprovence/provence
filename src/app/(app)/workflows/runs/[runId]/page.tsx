import { notFound } from "next/navigation";
import { requireWorkspaceActor } from "@/lib/workspace-context";
import { hasWorkspacePermission } from "@/lib/workspace-permissions";
import { getRunDetail } from "@/lib/workflows/workflow-service";
import { NotFoundError } from "@/lib/errors";
import { WorkflowRunDetailClient } from "@/components/workflow-run-detail-client";

export default async function WorkflowRunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
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
    detail = await getRunDetail(actor, runId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const { run, steps, logs } = detail;

  return (
    <div className="max-w-5xl">
      <WorkflowRunDetailClient
        runId={run.id}
        workflowDefinitionId={run.workflowDefinitionId}
        workflowName={run.workflowDefinition.name}
        status={run.status}
        trigger={run.trigger}
        input={run.input}
        output={run.output}
        error={run.error}
        escalatedToDirector={run.escalatedToDirector}
        steps={steps.map((s) => ({
          id: s.id,
          nodeId: s.nodeId,
          nodeType: s.nodeType,
          actionKey: s.actionKey,
          status: s.status,
          attempt: s.attempt,
          output: s.output,
          error: s.error,
          startedAt: s.startedAt?.toISOString() ?? null,
          finishedAt: s.finishedAt?.toISOString() ?? null,
          durationMs: s.durationMs,
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
