import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { replayDeadLetter } from "@/lib/automation/dlq";

/**
 * Remet un job de la Dead Letter Queue en file (`QUEUED`, tentative
 * réinitialisée) — jamais automatique, voir `dlq.ts`. N'affecte que le job
 * lui-même : si le run parent est déjà terminal (`FAILED`), il ne reprend
 * pas automatiquement — la reprise d'un run entier passe par
 * `POST /api/automations/runs/[runId]/retry` (nouveau run).
 */
export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_AUTOMATIONS");
    const { jobId } = await params;
    const job = await replayDeadLetter(jobId, { organizationId: actor.organization.id, workspaceId: actor.workspace.id });
    return NextResponse.json({ job });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/automations/dlq/[jobId]/replay" });
  }
}
