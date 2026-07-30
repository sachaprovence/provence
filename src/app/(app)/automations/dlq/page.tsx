import { requireWorkspaceActor } from "@/lib/workspace-context";
import { hasWorkspacePermission } from "@/lib/workspace-permissions";
import { listDeadLetters } from "@/lib/automation/dlq";
import { AutomationDlqClient } from "@/components/automation-dlq-client";

export default async function AutomationDlqPage() {
  const actor = await requireWorkspaceActor();

  if (!hasWorkspacePermission(actor.workspace.role, "VIEW_WORKSPACE")) {
    return (
      <div className="max-w-3xl">
        <p className="text-sm text-p360-danger">Vous n&apos;avez pas la permission de consulter la Dead Letter Queue.</p>
      </div>
    );
  }

  const jobs = await listDeadLetters({ organizationId: actor.organization.id, workspaceId: actor.workspace.id, limit: 100 });

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-p360-ink">☠️ Dead Letter Queue</h1>
        <p className="mt-1 text-sm text-p360-muted">
          Jobs dont les tentatives sont épuisées (ou stratégie de retry &quot;manuelle&quot;) — en attente d&apos;une décision
          explicite : relance ou abandon.
        </p>
      </div>

      <AutomationDlqClient
        jobs={jobs.map((job) => ({
          id: job.id,
          jobType: job.jobType,
          automationRunId: job.automationRunId,
          nodeId: job.nodeId,
          attempt: job.attempt,
          maxAttempts: job.maxAttempts,
          error: job.error,
          finishedAt: job.finishedAt?.toISOString() ?? null,
        }))}
        canManage={hasWorkspacePermission(actor.workspace.role, "MANAGE_AUTOMATIONS")}
      />
    </div>
  );
}
