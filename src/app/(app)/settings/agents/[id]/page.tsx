import { notFound } from "next/navigation";
import { requireWorkspaceActor } from "@/lib/workspace-context";
import { hasWorkspacePermission } from "@/lib/workspace-permissions";
import { resolveInstallationOrThrow } from "@/lib/agents/installation-service";
import { getInstallationStats, listRunsForInstallation } from "@/lib/agents/observability";
import { listMemory } from "@/lib/agents/memory";
import { listMessages } from "@/lib/agents/messaging";
import { NotFoundError } from "@/lib/errors";
import { AgentDetailClient } from "@/components/agent-detail-client";

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActor();
  const { id } = await params;

  if (!hasWorkspacePermission(actor.workspace.role, "MANAGE_WORKSPACE")) {
    return (
      <div className="max-w-3xl">
        <p className="text-sm text-p360-danger">Vous n&apos;avez pas la permission de consulter cet agent.</p>
      </div>
    );
  }

  let installation;
  try {
    installation = await resolveInstallationOrThrow(actor, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const [stats, runs, memoryEntries, messages] = await Promise.all([
    getInstallationStats(id),
    listRunsForInstallation(id),
    listMemory({ workspaceId: installation.workspaceId, installationId: id }),
    listMessages({ workspaceId: installation.workspaceId, installationId: id }),
  ]);

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-p360-ink">
          {installation.definition.icon ?? "🤖"} {installation.definition.name}
        </h1>
        <p className="mt-1 text-sm text-p360-muted">{installation.definition.description}</p>
      </div>

      <AgentDetailClient
        installationId={id}
        status={installation.status}
        grantedToolKeys={installation.grantedToolKeys}
        grantedPermissions={installation.grantedPermissions}
        declaredToolKeys={installation.definition.declaredToolKeys}
        declaredPermissions={installation.definition.declaredPermissions}
        stats={{
          totalRuns: stats.totalRuns,
          successRate: stats.successRate,
          averageDurationMs: stats.averageDurationMs,
          aiRequestCount: stats.aiRequestCount,
          estimatedAiCostUsd: stats.estimatedAiCostUsd,
          lastRunAt: stats.lastRunAt ? stats.lastRunAt.toISOString() : null,
          lastRunStatus: stats.lastRunStatus,
        }}
        runs={runs.map((r) => ({
          id: r.id,
          status: r.status,
          trigger: r.trigger,
          attempt: r.attempt,
          maxAttempts: r.maxAttempts,
          createdAt: r.createdAt.toISOString(),
          startedAt: r.startedAt ? r.startedAt.toISOString() : null,
          finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
        }))}
        memoryEntries={memoryEntries.map((m) => ({
          id: m.id,
          scope: m.scope,
          key: m.key,
          value: m.value,
          updatedAt: m.updatedAt.toISOString(),
        }))}
        messages={messages.map((m) => ({
          id: m.id,
          type: m.type,
          status: m.status,
          payload: m.payload,
          createdAt: m.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
