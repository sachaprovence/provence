import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse, NotFoundError } from "@/lib/errors";
import { resolvePlanOrThrow } from "@/lib/agents/director/planning-engine";
import { retryStepDelegation } from "@/lib/agents/director/delegation-engine";

/** Relance déclenchée par un humain depuis le tableau de bord — réutilise le même moteur de délégation que le Director lui-même. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; stepId: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_WORKSPACE");
    const { id, stepId } = await params;

    const plan = await resolvePlanOrThrow(actor.workspace.id, id);
    const step = plan.steps.find((s) => s.id === stepId);
    if (!step) throw new NotFoundError("Étape introuvable.");

    const director = await prisma.agentInstallation.findUniqueOrThrow({ where: { id: plan.installationId } });
    const updated = await retryStepDelegation(director, step);
    return NextResponse.json({ step: updated });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/agents/director/plans/[id]/steps/[stepId]/retry" });
  }
}
