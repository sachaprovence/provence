import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { resolveProspectForActor } from "@/lib/agents/commercial/commercial-service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "VIEW_WORKSPACE");
    const { id } = await params;
    const prospect = await resolveProspectForActor(actor, id);
    const actions = await prisma.commercialAction.findMany({ where: { prospectId: id }, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ prospect, actions });
  } catch (error) {
    return toApiErrorResponse(error, { route: "GET /api/commercial/prospects/[id]" });
  }
}
