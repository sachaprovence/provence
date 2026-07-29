import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createWorkspace,
  inviteWorkspaceMember,
  acceptWorkspaceInvitation,
  removeWorkspaceMember,
} from "@/lib/workspace-service";
import { MembershipRole, WorkspaceRole } from "@/generated/prisma/enums";
import type { CurrentActor } from "@/lib/auth";

/**
 * Test d'intégration (nécessite une vraie base PostgreSQL) : cycle de vie
 * complet d'un workspace — création (accès autorisé pour un OWNER),
 * invitation d'un membre encore inconnu du système, acceptation de
 * l'invitation (création de compte + Membership d'organisation +
 * WorkspaceMembership), puis retrait d'un membre. Complète
 * tests/tenant-isolation/workspaces.test.ts (permissions, falsification,
 * changement de rôle, archivage).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("cycle de vie d'un workspace", () => {
  const createdOrganizationIds: string[] = [];
  const createdUserIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  it("un OWNER peut créer un workspace additionnel (accès autorisé) et en devient automatiquement propriétaire", async () => {
    const suffix = crypto.randomUUID();
    const organization = await prisma.organization.create({ data: { name: `Org lifecycle ${suffix}` } });
    createdOrganizationIds.push(organization.id);

    const owner = await prisma.user.create({
      data: {
        email: `lifecycle-owner-${suffix}@example.test`,
        passwordHash: "not-a-real-hash",
        firstName: "Owner",
        lastName: "Test",
      },
    });
    createdUserIds.push(owner.id);
    const ownerMembership = await prisma.membership.create({
      data: { organizationId: organization.id, userId: owner.id, role: MembershipRole.OWNER_ADMIN },
    });

    const ownerActor: CurrentActor = {
      user: { id: owner.id, email: owner.email, firstName: owner.firstName, lastName: owner.lastName },
      membership: { id: ownerMembership.id, role: MembershipRole.OWNER_ADMIN, territoryId: null },
      organization: { id: organization.id, name: organization.name },
      sessionId: "unused-in-this-test",
    };

    const workspace = await createWorkspace(ownerActor, { name: "Équipe Nord", slug: "equipe-nord" });

    const ownerWorkspaceMembership = await prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: owner.id } },
    });
    expect(ownerWorkspaceMembership?.role).toBe(WorkspaceRole.OWNER);

    const createdLog = await prisma.auditLog.findFirst({
      where: { organizationId: organization.id, action: "workspace.created", entityId: workspace.id },
    });
    expect(createdLog).not.toBeNull();
  });

  it("inviter puis accepter une invitation crée le compte, le membership d'organisation et la WorkspaceMembership", async () => {
    const suffix = crypto.randomUUID();
    const organization = await prisma.organization.create({ data: { name: `Org invitation ${suffix}` } });
    createdOrganizationIds.push(organization.id);

    const owner = await prisma.user.create({
      data: {
        email: `invite-owner-${suffix}@example.test`,
        passwordHash: "not-a-real-hash",
        firstName: "Owner",
        lastName: "Test",
      },
    });
    createdUserIds.push(owner.id);
    const ownerMembership = await prisma.membership.create({
      data: { organizationId: organization.id, userId: owner.id, role: MembershipRole.OWNER_ADMIN },
    });
    const workspace = await prisma.workspace.create({
      data: { organizationId: organization.id, name: "Principal", slug: "principal", isDefault: true },
    });
    await prisma.workspaceMembership.create({
      data: { workspaceId: workspace.id, userId: owner.id, role: WorkspaceRole.OWNER },
    });

    const ownerActor: CurrentActor = {
      user: { id: owner.id, email: owner.email, firstName: owner.firstName, lastName: owner.lastName },
      membership: { id: ownerMembership.id, role: MembershipRole.OWNER_ADMIN, territoryId: null },
      organization: { id: organization.id, name: organization.name },
      sessionId: "unused-in-this-test",
    };

    const invitedEmail = `invitee-${suffix}@example.test`;
    const invitation = await inviteWorkspaceMember(ownerActor, workspace.id, {
      email: invitedEmail,
      role: WorkspaceRole.COMMERCIAL,
    });

    // L'invité n'a pas encore de compte : l'acceptation doit en créer un.
    const { user: acceptedUser } = await acceptWorkspaceInvitation(invitation.token, {
      firstName: "Nouvel",
      lastName: "Invité",
      password: "password1234",
    });
    createdUserIds.push(acceptedUser.id);

    expect(acceptedUser.email).toBe(invitedEmail);

    const orgMembership = await prisma.membership.findFirst({
      where: { organizationId: organization.id, userId: acceptedUser.id },
    });
    expect(orgMembership?.role).toBe(MembershipRole.SALES); // mapping COMMERCIAL -> SALES, voir ADR 0006

    const workspaceMembership = await prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: acceptedUser.id } },
    });
    expect(workspaceMembership?.role).toBe(WorkspaceRole.COMMERCIAL);

    const acceptedInvitation = await prisma.workspaceInvitation.findUnique({ where: { id: invitation.id } });
    expect(acceptedInvitation?.status).toBe("ACCEPTED");
  });

  it("retirer un membre supprime sa WorkspaceMembership et le journalise", async () => {
    const suffix = crypto.randomUUID();
    const organization = await prisma.organization.create({ data: { name: `Org retrait ${suffix}` } });
    createdOrganizationIds.push(organization.id);

    const owner = await prisma.user.create({
      data: {
        email: `remove-owner-${suffix}@example.test`,
        passwordHash: "not-a-real-hash",
        firstName: "Owner",
        lastName: "Test",
      },
    });
    createdUserIds.push(owner.id);
    const ownerMembership = await prisma.membership.create({
      data: { organizationId: organization.id, userId: owner.id, role: MembershipRole.OWNER_ADMIN },
    });
    const workspace = await prisma.workspace.create({
      data: { organizationId: organization.id, name: "Principal", slug: "principal", isDefault: true },
    });

    const member = await prisma.user.create({
      data: {
        email: `remove-member-${suffix}@example.test`,
        passwordHash: "not-a-real-hash",
        firstName: "Member",
        lastName: "Test",
      },
    });
    createdUserIds.push(member.id);
    const memberWorkspaceMembership = await prisma.workspaceMembership.create({
      data: { workspaceId: workspace.id, userId: member.id, role: WorkspaceRole.VIEWER },
    });

    const ownerActor: CurrentActor = {
      user: { id: owner.id, email: owner.email, firstName: owner.firstName, lastName: owner.lastName },
      membership: { id: ownerMembership.id, role: MembershipRole.OWNER_ADMIN, territoryId: null },
      organization: { id: organization.id, name: organization.name },
      sessionId: "unused-in-this-test",
    };

    await removeWorkspaceMember(ownerActor, workspace.id, memberWorkspaceMembership.id);

    const stillExists = await prisma.workspaceMembership.findUnique({ where: { id: memberWorkspaceMembership.id } });
    expect(stillExists).toBeNull();

    const removedLog = await prisma.auditLog.findFirst({
      where: { organizationId: organization.id, action: "workspace_member.removed", entityId: memberWorkspaceMembership.id },
    });
    expect(removedLog).not.toBeNull();
  });
});
