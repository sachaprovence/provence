import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { resolveInterventionSchema } from "@/lib/validations/agent";
import { resolveInterventionRequest } from "@/lib/agents/messaging";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = resolveInterventionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }

    const intervention = await resolveInterventionRequest({
      organizationId: actor.organization.id,
      workspaceId: actor.workspace.id,
      interventionId: id,
      resolvedById: actor.user.id,
      status: parsed.data.status,
    });
    return NextResponse.json({ intervention });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/agents/interventions/[id]/resolve" });
  }
}
