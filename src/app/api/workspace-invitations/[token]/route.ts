import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toApiErrorResponse } from "@/lib/errors";
import { acceptWorkspaceInvitationSchema } from "@/lib/validations/workspace";
import { acceptWorkspaceInvitation } from "@/lib/workspace-service";
import { WORKSPACE_ROLE_LABELS } from "@/lib/workspace-permissions";
import { createSession } from "@/lib/auth";

type Params = { params: Promise<{ token: string }> };

/** Route publique (aucune authentification) : consultation d'une invitation avant acceptation. */
export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const invitation = await prisma.workspaceInvitation.findUnique({
    where: { token },
    include: { workspace: true },
  });

  if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invitation invalide ou expirée." }, { status: 404 });
  }

  const existingUser = await prisma.user.findUnique({ where: { email: invitation.email } });

  return NextResponse.json({
    email: invitation.email,
    workspaceName: invitation.workspace.name,
    roleLabel: WORKSPACE_ROLE_LABELS[invitation.role],
    requiresAccountCreation: !existingUser,
  });
}

/** Route publique : acceptation d'une invitation (crée le compte si nécessaire, puis ouvre une session). */
export async function POST(request: Request, { params }: Params) {
  const { token } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = acceptWorkspaceInvitationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }

    const { user } = await acceptWorkspaceInvitation(token, parsed.data);
    await createSession(user.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toApiErrorResponse(error, { route: "POST /api/workspace-invitations/[token]" });
  }
}
