import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { createWorkspaceSchema } from "@/lib/validations/workspace";
import { listWorkspacesForOrganization, createWorkspace } from "@/lib/workspace-service";

export async function GET() {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  const workspaces = await listWorkspacesForOrganization(actor);
  return NextResponse.json({ workspaces, activeWorkspaceId: actor.workspace.id });
}

export async function POST(request: Request) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    await requireWorkspacePermission(actor, "MANAGE_WORKSPACE");

    const body = await request.json().catch(() => null);
    const parsed = createWorkspaceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }

    const workspace = await createWorkspace(actor, parsed.data);
    return NextResponse.json({ workspace }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/workspaces" });
  }
}
