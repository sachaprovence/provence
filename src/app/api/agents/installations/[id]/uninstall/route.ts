import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { transitionInstallation } from "@/lib/agents/installation-service";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    const { id } = await params;
    await requireWorkspacePermission(actor, "MANAGE_WORKSPACE");
    const installation = await transitionInstallation(actor, id, "uninstall");
    return NextResponse.json({ installation });
  } catch (error) {
    return toApiErrorResponse(error, { route: "POST /api/agents/installations/[id]/uninstall" });
  }
}
