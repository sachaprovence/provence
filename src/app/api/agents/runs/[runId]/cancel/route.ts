import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse, NotFoundError } from "@/lib/errors";
import { cancelAgentRun } from "@/lib/agents/execution-engine";

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    const { runId } = await params;
    await requireWorkspacePermission(actor, "MANAGE_WORKSPACE");

    // Revérifie que l'exécution appartient bien à l'organisation de l'acteur
    // avant toute action (jamais de confiance dans le seul id de l'URL).
    const owned = await prisma.agentRun.findFirst({
      where: { id: runId, installation: { organizationId: actor.organization.id } },
      select: { id: true },
    });
    if (!owned) throw new NotFoundError("Exécution introuvable.");

    const run = await cancelAgentRun(runId);
    return NextResponse.json({ run });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/agents/runs/[runId]/cancel" });
  }
}
