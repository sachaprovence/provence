import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession, hashPassword, recordLoginEvent } from "@/lib/auth";
import { registerSchema } from "@/lib/validations/auth";
import { bootstrapOrganization } from "@/lib/bootstrap";
import { writeAuditLog } from "@/lib/audit";
import { MembershipRole, WorkspaceRole } from "@/generated/prisma/enums";
import { WORKSPACE_AUDIT_ACTIONS } from "@/lib/workspace-permissions";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }
  const { organizationName, firstName, lastName, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await recordLoginEvent({ email, success: false, reason: "email_already_used" });
    return NextResponse.json({ error: "Un compte existe déjà avec cet email." }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);

  const { organization, user, workspace } = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({ data: { name: organizationName } });
    const user = await tx.user.create({ data: { email, passwordHash, firstName, lastName } });
    await tx.membership.create({ data: { organizationId: organization.id, userId: user.id, role: MembershipRole.OWNER_ADMIN } });

    // Toute organisation reçoit un workspace par défaut dès sa création
    // (voir ADR 0005) — sans quoi son propriétaire n'aurait accès à aucun
    // workspace et serait bloqué à la connexion (requireWorkspaceActor()).
    const workspace = await tx.workspace.create({
      data: { organizationId: organization.id, name: organizationName, slug: "principal", isDefault: true },
    });
    await tx.workspaceMembership.create({
      data: { workspaceId: workspace.id, userId: user.id, role: WorkspaceRole.OWNER, invitedById: user.id },
    });

    return { organization, user, workspace };
  });

  await bootstrapOrganization(organization.id);
  await createSession(user.id);
  await recordLoginEvent({ email, success: true, organizationId: organization.id, userId: user.id });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: WORKSPACE_AUDIT_ACTIONS.ORGANIZATION_CREATED,
    entityType: "Organization",
    entityId: organization.id,
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: WORKSPACE_AUDIT_ACTIONS.WORKSPACE_CREATED,
    entityType: "Workspace",
    entityId: workspace.id,
    metadata: { name: workspace.name, slug: workspace.slug, isDefault: true },
  });

  return NextResponse.json({ organizationId: organization.id, userId: user.id }, { status: 201 });
}
