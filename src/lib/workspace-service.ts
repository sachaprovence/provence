import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword, type CurrentActor } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { publishAutomationEvent } from "@/lib/automation/triggers/event-dispatcher";
import { NotFoundError, ConflictError, ValidationError } from "@/lib/errors";
import { WORKSPACE_AUDIT_ACTIONS } from "@/lib/workspace-permissions";
import { assertMemberLimitAvailable } from "@/lib/billing/plan-service";
import { WorkspaceRole, MembershipRole } from "@/generated/prisma/enums";

const INVITATION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 jours

/**
 * Correspondance rôle de workspace -> rôle d'organisation "historique"
 * (voir ADR 0006), utilisée uniquement pour attribuer un rôle d'organisation
 * raisonnable à un membre invité qui n'appartient pas encore à
 * l'organisation. N'affecte jamais un `Membership` déjà existant.
 */
export function workspaceRoleToLegacyMembershipRole(role: WorkspaceRole): MembershipRole {
  switch (role) {
    case WorkspaceRole.OWNER:
    case WorkspaceRole.ADMIN:
      return MembershipRole.OWNER_ADMIN;
    case WorkspaceRole.OPERATOR:
      return MembershipRole.PROVIDER;
    case WorkspaceRole.MANAGER:
    case WorkspaceRole.COMMERCIAL:
    case WorkspaceRole.ACCOUNTANT:
    case WorkspaceRole.SUPPORT:
    case WorkspaceRole.VIEWER:
    default:
      return MembershipRole.SALES;
  }
}

/**
 * Récupère un workspace en le filtrant STRICTEMENT par l'organisation de
 * l'acteur courant — jamais par le seul id fourni par le client (voir ADR
 * 0005, contrainte "aucune confiance dans un organizationId/workspaceId
 * envoyé par le client"). Une `NotFoundError` (jamais une erreur qui
 * confirmerait l'existence de la ressource à un tiers non autorisé) est
 * levée si le workspace n'existe pas ou appartient à une autre
 * organisation.
 */
export async function resolveWorkspaceOrThrow(actor: CurrentActor, workspaceId: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, organizationId: actor.organization.id },
  });
  if (!workspace) throw new NotFoundError("Workspace introuvable.");
  return workspace;
}

export async function listWorkspacesForOrganization(actor: CurrentActor) {
  return prisma.workspace.findMany({
    where: { organizationId: actor.organization.id },
    orderBy: { createdAt: "asc" },
  });
}

export async function createWorkspace(
  actor: CurrentActor,
  input: { name: string; slug: string; description?: string | null }
) {
  const existing = await prisma.workspace.findFirst({
    where: { organizationId: actor.organization.id, slug: input.slug },
  });
  if (existing) throw new ConflictError("Un workspace avec cet identifiant existe déjà.");

  const workspace = await prisma.$transaction(async (tx) => {
    const created = await tx.workspace.create({
      data: {
        organizationId: actor.organization.id,
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
      },
    });
    // Le créateur devient automatiquement propriétaire du nouveau workspace.
    await tx.workspaceMembership.create({
      data: { workspaceId: created.id, userId: actor.user.id, role: WorkspaceRole.OWNER, invitedById: actor.user.id },
    });
    return created;
  });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: WORKSPACE_AUDIT_ACTIONS.WORKSPACE_CREATED,
    entityType: "Workspace",
    entityId: workspace.id,
    metadata: { name: workspace.name, slug: workspace.slug },
  });
  await publishAutomationEvent("workspace.created", { organizationId: actor.organization.id, workspaceId: workspace.id });

  return workspace;
}

export async function updateWorkspace(
  actor: CurrentActor,
  workspaceId: string,
  input: { name?: string; description?: string | null }
) {
  await resolveWorkspaceOrThrow(actor, workspaceId);
  const updated = await prisma.workspace.update({ where: { id: workspaceId }, data: input });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: WORKSPACE_AUDIT_ACTIONS.WORKSPACE_UPDATED,
    entityType: "Workspace",
    entityId: workspaceId,
    metadata: input,
  });

  return updated;
}

export async function archiveWorkspace(actor: CurrentActor, workspaceId: string) {
  const workspace = await resolveWorkspaceOrThrow(actor, workspaceId);
  if (workspace.isDefault) {
    throw new ValidationError("Le workspace par défaut d'une organisation ne peut pas être archivé.");
  }

  const updated = await prisma.workspace.update({
    where: { id: workspaceId },
    data: { archivedAt: new Date(), archivedById: actor.user.id },
  });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: WORKSPACE_AUDIT_ACTIONS.WORKSPACE_ARCHIVED,
    entityType: "Workspace",
    entityId: workspaceId,
  });

  return updated;
}

export async function restoreWorkspace(actor: CurrentActor, workspaceId: string) {
  await resolveWorkspaceOrThrow(actor, workspaceId);
  const updated = await prisma.workspace.update({
    where: { id: workspaceId },
    data: { archivedAt: null, archivedById: null },
  });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: WORKSPACE_AUDIT_ACTIONS.WORKSPACE_RESTORED,
    entityType: "Workspace",
    entityId: workspaceId,
  });

  return updated;
}

export async function listWorkspaceMembers(actor: CurrentActor, workspaceId: string) {
  await resolveWorkspaceOrThrow(actor, workspaceId);
  return prisma.workspaceMembership.findMany({
    where: { workspaceId },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function inviteWorkspaceMember(
  actor: CurrentActor,
  workspaceId: string,
  input: { email: string; role: WorkspaceRole }
) {
  await resolveWorkspaceOrThrow(actor, workspaceId);

  const existingUser = await prisma.user.findUnique({ where: { email: input.email } });
  if (existingUser) {
    const alreadyMember = await prisma.workspaceMembership.findFirst({
      where: { workspaceId, userId: existingUser.id },
    });
    if (alreadyMember) throw new ConflictError("Cet utilisateur est déjà membre de ce workspace.");
  }

  const token = crypto.randomBytes(32).toString("hex");
  const invitation = await prisma.workspaceInvitation.create({
    data: {
      workspaceId,
      email: input.email,
      role: input.role,
      token,
      invitedById: actor.user.id,
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    },
  });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: WORKSPACE_AUDIT_ACTIONS.MEMBER_INVITED,
    entityType: "WorkspaceInvitation",
    entityId: invitation.id,
    metadata: { email: input.email, role: input.role },
  });

  return invitation;
}

export async function changeWorkspaceMemberRole(
  actor: CurrentActor,
  workspaceId: string,
  membershipId: string,
  role: WorkspaceRole
) {
  await resolveWorkspaceOrThrow(actor, workspaceId);
  const membership = await prisma.workspaceMembership.findFirst({ where: { id: membershipId, workspaceId } });
  if (!membership) throw new NotFoundError("Membre introuvable dans ce workspace.");

  const previousRole = membership.role;
  const updated = await prisma.workspaceMembership.update({ where: { id: membershipId }, data: { role } });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: WORKSPACE_AUDIT_ACTIONS.MEMBER_ROLE_CHANGED,
    entityType: "WorkspaceMembership",
    entityId: membershipId,
    metadata: { previousRole, newRole: role },
  });

  return updated;
}

export async function removeWorkspaceMember(actor: CurrentActor, workspaceId: string, membershipId: string) {
  await resolveWorkspaceOrThrow(actor, workspaceId);
  const membership = await prisma.workspaceMembership.findFirst({ where: { id: membershipId, workspaceId } });
  if (!membership) throw new NotFoundError("Membre introuvable dans ce workspace.");

  await prisma.workspaceMembership.delete({ where: { id: membershipId } });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: WORKSPACE_AUDIT_ACTIONS.MEMBER_REMOVED,
    entityType: "WorkspaceMembership",
    entityId: membershipId,
  });
}

/**
 * Accepte une invitation de workspace : crée le compte utilisateur si
 * nécessaire, garantit une `Membership` d'organisation (créée avec un rôle
 * historique correspondant si absente — nécessaire pour que l'utilisateur
 * puisse se connecter, voir `workspaceRoleToLegacyMembershipRole`), puis la
 * `WorkspaceMembership` elle-même. Mode démo : aucun email n'est envoyé, le
 * lien d'invitation est renvoyé directement par l'API d'invitation (voir
 * `src/app/api/workspaces/[id]/members/route.ts`).
 */
export async function acceptWorkspaceInvitation(
  token: string,
  input: { firstName?: string; lastName?: string; password?: string }
) {
  const invitation = await prisma.workspaceInvitation.findUnique({ where: { token } });
  if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt < new Date()) {
    throw new NotFoundError("Invitation invalide ou expirée.");
  }

  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: invitation.workspaceId } });

  let user = await prisma.user.findUnique({ where: { email: invitation.email } });
  if (!user) {
    if (!input.firstName || !input.lastName || !input.password) {
      throw new ValidationError("Prénom, nom et mot de passe requis pour créer le compte.");
    }
    user = await prisma.user.create({
      data: {
        email: invitation.email,
        firstName: input.firstName,
        lastName: input.lastName,
        passwordHash: await hashPassword(input.password),
      },
    });
  }
  const acceptedUser = user;

  const existingOrgMembership = await prisma.membership.findFirst({
    where: { organizationId: workspace.organizationId, userId: acceptedUser.id },
  });
  if (!existingOrgMembership) {
    await assertMemberLimitAvailable(workspace.organizationId);
  }

  await prisma.$transaction(async (tx) => {
    const orgMembership = await tx.membership.findFirst({
      where: { organizationId: workspace.organizationId, userId: acceptedUser.id },
    });
    if (!orgMembership) {
      await tx.membership.create({
        data: {
          organizationId: workspace.organizationId,
          userId: acceptedUser.id,
          role: workspaceRoleToLegacyMembershipRole(invitation.role),
        },
      });
    }

    await tx.workspaceMembership.upsert({
      where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: acceptedUser.id } },
      update: { role: invitation.role },
      create: {
        workspaceId: invitation.workspaceId,
        userId: acceptedUser.id,
        role: invitation.role,
        invitedById: invitation.invitedById,
      },
    });

    await tx.workspaceInvitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
  });

  await writeAuditLog({
    organizationId: workspace.organizationId,
    userId: acceptedUser.id,
    action: "workspace_invitation.accepted",
    entityType: "WorkspaceInvitation",
    entityId: invitation.id,
  });

  return { user: acceptedUser, workspace };
}
