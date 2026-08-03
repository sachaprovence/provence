import { requireWorkspaceActor } from "@/lib/workspace-context";
import { hasWorkspacePermission } from "@/lib/workspace-permissions";
import { listDefinitionsForWorkspace } from "@/lib/workflows/workflow-service";
import { getWorkflowDashboard } from "@/lib/workflows/dashboard-service";
import { WorkflowsListClient } from "@/components/workflows-list-client";

export default async function WorkflowsPage() {
  const actor = await requireWorkspaceActor();

  if (!hasWorkspacePermission(actor.workspace.role, "VIEW_WORKSPACE")) {
    return (
      <div className="max-w-3xl">
        <p className="text-sm text-p360-danger">Vous n&apos;avez pas la permission de consulter les workflows.</p>
      </div>
    );
  }

  const [allDefinitions, dashboard] = await Promise.all([
    listDefinitionsForWorkspace(actor.workspace.id, { includeTemplates: true }),
    getWorkflowDashboard(actor.workspace.id),
  ]);

  const definitions = allDefinitions.filter((d) => !d.isTemplate);
  const templates = allDefinitions.filter((d) => d.isTemplate);
  const canManage = hasWorkspacePermission(actor.workspace.role, "MANAGE_WORKFLOWS");

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-p360-ink">🔀 Workflows</h1>
        <p className="mt-1 text-sm text-p360-muted">
          Le moteur d&apos;automatisation d&apos;Autorun : créez, versionnez, activez et suivez vos workflows — toutes les
          automatisations futures passent par ici, aucune n&apos;est codée en dur dans un module métier.
        </p>
      </div>

      <WorkflowsListClient
        definitions={definitions.map((d) => ({
          id: d.id,
          key: d.key,
          name: d.name,
          description: d.description,
          category: d.category,
          status: d.status,
          isTemplate: d.isTemplate,
          updatedAt: d.updatedAt.toISOString(),
        }))}
        templates={templates.map((d) => ({
          id: d.id,
          key: d.key,
          name: d.name,
          description: d.description,
          category: d.category,
          status: d.status,
          isTemplate: d.isTemplate,
          updatedAt: d.updatedAt.toISOString(),
        }))}
        dashboard={dashboard}
        canManage={canManage}
      />
    </div>
  );
}
