import { NextResponse } from "next/server";
import { requireWorkspaceActorApi, isWorkspaceActorResponse, requireWorkspacePermission } from "@/lib/workspace-context";
import { toApiErrorResponse } from "@/lib/errors";
import { inviteWorkspaceMemberSchema } from "@/lib/validations/workspace";
import { listWorkspaceMembers, inviteWorkspaceMember } from "@/lib/workspace-service";
import { env } from "@/lib/env";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    const { id } = await params;
    const members = await listWorkspaceMembers(actor, id);
    return NextResponse.json({ members });
  } catch (error) {
    return toApiErrorResponse(error, { route: "GET /api/workspaces/[id]/members" });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireWorkspaceActorApi();
  if (isWorkspaceActorResponse(actor)) return actor;

  try {
    const { id } = await params;
    await requireWorkspacePermission(actor, "MANAGE_MEMBERS");

    const body = await request.json().catch(() => null);
    const parsed = inviteWorkspaceMemberSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }

    const invitation = await inviteWorkspaceMember(actor, id, parsed.data);

    // Mode démo (par défaut, voir .env.example) : aucun email n'est envoyé,
    // le lien d'invitation est renvoyé directement — même pattern que
    // POST /api/auth/reset-password/request (`demoResetLink`).
    const demoInvitationLink =
      env.EMAIL_PROVIDER === "demo" ? `/workspace-invitations/${invitation.token}` : undefined;

    return NextResponse.json({ invitation, demoInvitationLink }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, { route: "POST /api/workspaces/[id]/members" });
  }
}
