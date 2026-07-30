import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { resolveInstallationOrThrow } from "@/lib/agents/installation-service";
import { listMemory } from "@/lib/agents/memory";

/** Vue de débogage/admin sur la mémoire d'une installation (SHORT_TERM/PERSISTENT). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    const { id } = await params;
    await requireWorkspacePermission(actor, "MANAGE_WORKSPACE");
    const installation = await resolveInstallationOrThrow(actor, id);
    const entries = await listMemory({ workspaceId: installation.workspaceId, installationId: id });
    return NextResponse.json({ entries });
  } catch (error) {
    return toApiErrorResponse(error, { route: "GET /api/agents/installations/[id]/memory" });
  }
}
