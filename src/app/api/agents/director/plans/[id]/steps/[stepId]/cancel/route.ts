import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse, NotFoundError } from "@/lib/errors";
import { resolvePlanOrThrow } from "@/lib/agents/director/planning-engine";
import { cancelStepDelegation } from "@/lib/agents/director/delegation-engine";

/** Annulation déclenchée par un humain depuis le tableau de bord — réutilise le même moteur de délégation que le Director lui-même. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; stepId: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_WORKSPACE");
    const { id, stepId } = await params;

    const plan = await resolvePlanOrThrow(actor.workspace.id, id);
    const step = plan.steps.find((s) => s.id === stepId);
    if (!step) throw new NotFoundError("Étape introuvable.");

    const updated = await cancelStepDelegation(step);
    return NextResponse.json({ step: updated });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/agents/director/plans/[id]/steps/[stepId]/cancel" });
  }
}
