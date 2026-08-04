import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { changeWorkspaceMemberRoleSchema } from "@/lib/validations/workspace";
import { changeWorkspaceMemberRole, removeWorkspaceMember } from "@/lib/workspace-service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; membershipId: string }> }
) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    const { id, membershipId } = await params;
    await requireWorkspacePermission(actor, "MANAGE_MEMBERS");

    const body = await request.json().catch(() => null);
    const parsed = changeWorkspaceMemberRoleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }

    const membership = await changeWorkspaceMemberRole(actor, id, membershipId, parsed.data.role);
    return NextResponse.json({ membership });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "PATCH /api/workspaces/[id]/members/[membershipId]" });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; membershipId: string }> }
) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    const { id, membershipId } = await params;
    await requireWorkspacePermission(actor, "MANAGE_MEMBERS");
    await removeWorkspaceMember(actor, id, membershipId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "DELETE /api/workspaces/[id]/members/[membershipId]" });
  }
}
