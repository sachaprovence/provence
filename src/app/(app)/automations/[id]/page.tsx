import { notFound } from "next/navigation";
import { requireWorkspaceActor } from "@/lib/workspace-context";
import { hasWorkspacePermission } from "@/lib/workspace-permissions";
import { getAutomationDetail } from "@/lib/automation/registry/automation-service";
import { registerBuiltInAutomationComponents } from "@/lib/automation/bootstrap";
import { listAutomationTriggerTypes } from "@/lib/automation/triggers";
import { listAutomationJobHandlers } from "@/lib/automation/actions";
import { NotFoundError } from "@/lib/errors";
import { AutomationEditorClient } from "@/components/automation-editor-client";
import type { AutomationGraph } from "@/lib/automation/graph-types";

export default async function AutomationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireWorkspaceActor();

  if (!hasWorkspacePermission(actor.workspace.role, "VIEW_WORKSPACE")) {
    return (
      <div className="max-w-3xl">
        <p className="text-sm text-p360-danger">Vous n&apos;avez pas la permission de consulter cette automatisation.</p>
      </div>
    );
  }

  let detail;
  try {
    detail = await getAutomationDetail(actor, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  registerBuiltInAutomationComponents();
  const { automation, versions, recentRuns } = detail;
  const editingVersion = versions.find((v) => v.id === automation.activeVersionId) ?? versions[0];
  const initialGraph = (editingVersion?.graph as unknown as AutomationGraph) ?? { nodes: [], edges: [] };

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-p360-ink">⚡ {automation.name}</h1>
        {automation.description && <p className="mt-1 text-sm text-p360-muted">{automation.description}</p>}
      </div>

      <AutomationEditorClient
        automationId={automation.id}
        automationKey={automation.key}
        status={automation.status}
        activeVersionId={automation.activeVersionId}
        versions={versions.map((v) => ({ id: v.id, version: v.version, changelog: v.changelog, createdAt: v.createdAt.toISOString() }))}
        recentRuns={recentRuns.map((r) => ({
          id: r.id,
          status: r.status,
          trigger: r.trigger,
          createdAt: r.createdAt.toISOString(),
          finishedAt: r.finishedAt?.toISOString() ?? null,
        }))}
        initialGraph={initialGraph}
        registry={{
          triggers: listAutomationTriggerTypes(),
          actions: listAutomationJobHandlers().map((a) => ({ key: a.key, name: a.name, description: a.description, category: a.category })),
        }}
        canManage={hasWorkspacePermission(actor.workspace.role, "MANAGE_AUTOMATIONS") && !automation.isTemplate}
      />
    </div>
  );
}
