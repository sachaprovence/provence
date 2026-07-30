import { notFound } from "next/navigation";
import { requireWorkspaceActor } from "@/lib/workspace-context";
import { hasWorkspacePermission } from "@/lib/workspace-permissions";
import { getDefinitionDetail } from "@/lib/workflows/workflow-service";
import { registerBuiltInWorkflowComponents } from "@/lib/workflows/bootstrap";
import { listTriggerTypes } from "@/lib/workflows/triggers/registry";
import { listWorkflowActions } from "@/lib/workflows/actions/registry";
import { NotFoundError } from "@/lib/errors";
import { WorkflowEditorClient } from "@/components/workflow-editor-client";
import type { WorkflowGraph } from "@/lib/workflows/graph-types";

export default async function WorkflowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireWorkspaceActor();

  if (!hasWorkspacePermission(actor.workspace.role, "VIEW_WORKSPACE")) {
    return (
      <div className="max-w-3xl">
        <p className="text-sm text-p360-danger">Vous n&apos;avez pas la permission de consulter ce workflow.</p>
      </div>
    );
  }

  let detail;
  try {
    detail = await getDefinitionDetail(actor, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  registerBuiltInWorkflowComponents();
  const { definition, versions, recentRuns } = detail;
  const editingVersion = versions.find((v) => v.id === definition.activeVersionId) ?? versions[0];
  const initialGraph = (editingVersion?.graph as unknown as WorkflowGraph) ?? { nodes: [], edges: [] };

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-p360-ink">🔀 {definition.name}</h1>
        {definition.description && <p className="mt-1 text-sm text-p360-muted">{definition.description}</p>}
      </div>

      <WorkflowEditorClient
        definitionId={definition.id}
        definitionKey={definition.key}
        status={definition.status}
        activeVersionId={definition.activeVersionId}
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
          triggers: listTriggerTypes(),
          actions: listWorkflowActions().map((a) => ({ key: a.key, name: a.name, description: a.description, category: a.category })),
        }}
        canManage={hasWorkspacePermission(actor.workspace.role, "MANAGE_WORKFLOWS") && !definition.isTemplate}
      />
    </div>
  );
}
