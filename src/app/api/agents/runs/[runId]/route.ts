import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceActorApi, isWorkspaceActorResponse } from "@/lib/workspace-context";
import { toApiErrorResponse, NotFoundError } from "@/lib/errors";
import { listRunLogs } from "@/lib/agents/observability";

/** Détail d'une exécution + son journal. `runId` revérifié contre l'organisation de l'acteur (jamais de confiance directe). */
export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    const { runId } = await params;
    const run = await prisma.agentRun.findFirst({
      where: { id: runId, installation: { organizationId: actor.organization.id } },
      include: { installation: { include: { definition: true } } },
    });
    if (!run) throw new NotFoundError("Exécution introuvable.");

    const logs = await listRunLogs(runId);
    return NextResponse.json({ run, logs });
  } catch (error) {
    return toApiErrorResponse(error, { route: "GET /api/agents/runs/[runId]" });
  }
}
