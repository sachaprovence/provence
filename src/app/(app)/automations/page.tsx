import Link from "next/link";
import { requireWorkspaceActor } from "@/lib/workspace-context";
import { hasWorkspacePermission } from "@/lib/workspace-permissions";
import { listAutomationsForWorkspace } from "@/lib/automation/registry/automation-service";
import { getAutomationDashboard } from "@/lib/automation/dashboard-service";
import { AutomationsListClient } from "@/components/automations-list-client";

export default async function AutomationsPage() {
  const actor = await requireWorkspaceActor();

  if (!hasWorkspacePermission(actor.workspace.role, "VIEW_WORKSPACE")) {
    return (
      <div className="max-w-3xl">
        <p className="text-sm text-p360-danger">Vous n&apos;avez pas la permission de consulter les automatisations.</p>
      </div>
    );
  }

  const [allAutomations, dashboard] = await Promise.all([
    listAutomationsForWorkspace(actor.workspace.id, { includeTemplates: true }),
    getAutomationDashboard(actor.workspace.id),
  ]);

  const automations = allAutomations.filter((a) => !a.isTemplate);
  const templates = allAutomations.filter((a) => a.isTemplate);
  const canManage = hasWorkspacePermission(actor.workspace.role, "MANAGE_AUTOMATIONS");

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-p360-ink">⚡ Automatisations</h1>
        <p className="mt-1 text-sm text-p360-muted">
          Le noyau d&apos;automatisation Enterprise d&apos;Autorun : chaque noeud d&apos;action s&apos;exécute comme un job
          durable (retryable, verrouillable, priorisé) — voir aussi le moteur de{" "}
          <Link href="/workflows" className="text-p360-blue underline">
            Workflows
          </Link>{" "}
          pour l&apos;orchestration en mémoire plus simple.
        </p>
      </div>

      <AutomationsListClient
        automations={automations.map((a) => ({
          id: a.id,
          key: a.key,
          name: a.name,
          description: a.description,
          category: a.category,
          status: a.status,
          isTemplate: a.isTemplate,
          updatedAt: a.updatedAt.toISOString(),
        }))}
        templates={templates.map((a) => ({
          id: a.id,
          key: a.key,
          name: a.name,
          description: a.description,
          category: a.category,
          status: a.status,
          isTemplate: a.isTemplate,
          updatedAt: a.updatedAt.toISOString(),
        }))}
        dashboard={dashboard}
        canManage={canManage}
      />
    </div>
  );
}
