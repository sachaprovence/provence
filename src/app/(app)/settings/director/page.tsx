import { requireWorkspaceActor } from "@/lib/workspace-context";
import { hasWorkspacePermission } from "@/lib/workspace-permissions";
import { resolveDirectorInstallation, getDirectorDashboard } from "@/lib/agents/director/dashboard-service";
import { DirectorDashboardClient } from "@/components/director-dashboard-client";

export default async function DirectorPage() {
  const actor = await requireWorkspaceActor();

  if (!hasWorkspacePermission(actor.workspace.role, "MANAGE_WORKSPACE")) {
    return (
      <div className="max-w-3xl">
        <p className="text-sm text-p360-danger">Vous n&apos;avez pas la permission de consulter le Director.</p>
      </div>
    );
  }

  const [director, dashboard] = await Promise.all([
    resolveDirectorInstallation(actor.workspace.id),
    getDirectorDashboard(actor.workspace.id),
  ]);

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-p360-ink">🧭 Agent Director</h1>
        <p className="mt-1 text-sm text-p360-muted">
          Orchestrateur : décompose vos demandes en étapes, choisit et délègue aux agents installés, attend leurs
          résultats, les fusionne. Ne réalise jamais lui-même de tâche métier.
        </p>
      </div>

      <DirectorDashboardClient
        directorInstalled={!!director}
        directorStatus={director?.status ?? null}
        activeAgents={dashboard.activeAgents.map((agent) => ({
          id: agent.id,
          name: agent.definition.name,
          category: agent.definition.category,
          icon: agent.definition.icon,
        }))}
        tasks={dashboard.tasks}
        queuedRuns={dashboard.queuedRuns}
        activeSchedules={dashboard.activeSchedules.map((schedule) => ({
          id: schedule.id,
          kind: schedule.kind,
          nextRunAt: schedule.nextRunAt ? schedule.nextRunAt.toISOString() : null,
          agentName: schedule.installation.definition.name,
        }))}
        recentPlans={dashboard.recentPlans.map((plan) => ({
          id: plan.id,
          goal: plan.goal,
          status: plan.status,
          createdAt: plan.createdAt.toISOString(),
          stepCount: plan.steps.length,
        }))}
        recentMessages={dashboard.recentMessages.map((message) => ({
          id: message.id,
          type: message.type,
          status: message.status,
          createdAt: message.createdAt.toISOString(),
        }))}
        consumption={{
          totalRuns: dashboard.consumption.totalRuns,
          averageDurationMs: dashboard.consumption.averageDurationMs,
          aiRequestCount: dashboard.consumption.aiRequestCount,
          estimatedAiCostUsd: dashboard.consumption.estimatedAiCostUsd,
        }}
      />
    </div>
  );
}
