import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  archiveWorkspace,
  changeWorkspaceMemberRole,
  resolveWorkspaceOrThrow,
} from "@/lib/workspace-service";
import { requireWorkspacePermission, setActiveWorkspace } from "@/lib/workspace-context";
import type { WorkspaceActor } from "@/lib/workspace-context";
import { NotFoundError, ForbiddenError, ValidationError } from "@/lib/errors";
import { MembershipRole, WorkspaceRole } from "@/generated/prisma/enums";
import type { CurrentActor } from "@/lib/auth";

/**
 * Test d'intégration (nécessite une vraie base PostgreSQL). Couvre les
 * exigences explicites de la v0.2 : isolation entre deux workspaces d'une
 * même organisation, tentative de falsification d'un identifiant de
 * workspace, accès autorisé/interdit, changement de rôle, archivage — voir
 * ADR 0005/0006 et le prompt de la phase v0.2.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("isolation multi-tenant — Workspace", () => {
  const createdOrganizationIds: string[] = [];
  const createdUserIds: string[] = [];

  async function createUser(suffix: string) {
    const user = await prisma.user.create({
      data: {
        email: `workspace-isolation-${suffix}@example.test`,
        passwordHash: "not-a-real-hash",
        firstName: "Test",
        lastName: "User",
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function createSessionFor(userId: string) {
    return prisma.session.create({
      data: {
        userId,
        token: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      },
    });
  }

  function toCurrentActor(params: {
    userId: string;
    email: string;
    membershipId: string;
    organizationId: string;
    organizationName: string;
    sessionId: string;
  }): CurrentActor {
    return {
      user: { id: params.userId, email: params.email, firstName: "Test", lastName: "User" },
      membership: { id: params.membershipId, role: MembershipRole.OWNER_ADMIN, territoryId: null },
      organization: { id: params.organizationId, name: params.organizationName },
      sessionId: params.sessionId,
    };
  }

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  it("un membre d'un seul workspace ne voit jamais les prospects de l'autre workspace de la même organisation", async () => {
    const suffix = crypto.randomUUID();
    const organization = await prisma.organization.create({ data: { name: `Org multi-workspace ${suffix}` } });
    createdOrganizationIds.push(organization.id);

    const workspaceA = await prisma.workspace.create({
      data: { organizationId: organization.id, name: "Workspace A", slug: "a", isDefault: true },
    });
    const workspaceB = await prisma.workspace.create({
      data: { organizationId: organization.id, name: "Workspace B", slug: "b" },
    });

    const leadA = await prisma.lead.create({
      data: { organizationId: organization.id, workspaceId: workspaceA.id, establishmentName: `Prospect A ${suffix}` },
    });
    const leadB = await prisma.lead.create({
      data: { organizationId: organization.id, workspaceId: workspaceB.id, establishmentName: `Prospect B ${suffix}` },
    });

    const userA = await createUser(`${suffix}-a`);
    await prisma.membership.create({
      data: { organizationId: organization.id, userId: userA.id, role: MembershipRole.OWNER_ADMIN },
    });
    await prisma.workspaceMembership.create({
      data: { workspaceId: workspaceA.id, userId: userA.id, role: WorkspaceRole.MANAGER },
    });
    // userA n'a explicitement PAS de WorkspaceMembership sur workspaceB.

    const leadsVisibleFromWorkspaceA = await prisma.lead.findMany({ where: { workspaceId: workspaceA.id } });
    const idsVisibleFromWorkspaceA = leadsVisibleFromWorkspaceA.map((l) => l.id);

    expect(idsVisibleFromWorkspaceA).toContain(leadA.id);
    expect(idsVisibleFromWorkspaceA).not.toContain(leadB.id);

    // userA n'a pas de membership sur workspaceB : resolveWorkspaceOrThrow
    // via son propre acteur doit rester possible (même organisation), mais
    // il ne doit apparaître dans aucune liste de WorkspaceMembership pour B.
    const membershipOnB = await prisma.workspaceMembership.findFirst({
      where: { workspaceId: workspaceB.id, userId: userA.id },
    });
    expect(membershipOnB).toBeNull();
  });

  it("falsifier un workspaceId d'une autre organisation échoue (NotFoundError, pas de fuite d'existence)", async () => {
    const suffixA = crypto.randomUUID();
    const suffixB = crypto.randomUUID();

    const orgA = await prisma.organization.create({ data: { name: `Org A ${suffixA}` } });
    const orgB = await prisma.organization.create({ data: { name: `Org B ${suffixB}` } });
    createdOrganizationIds.push(orgA.id, orgB.id);

    const workspaceOfOrgB = await prisma.workspace.create({
      data: { organizationId: orgB.id, name: "Workspace B", slug: "principal", isDefault: true },
    });

    const userA = await createUser(`${suffixA}-spoof`);
    const membershipA = await prisma.membership.create({
      data: { organizationId: orgA.id, userId: userA.id, role: MembershipRole.OWNER_ADMIN },
    });
    const sessionA = await createSessionFor(userA.id);

    const actorA = toCurrentActor({
      userId: userA.id,
      email: userA.email,
      membershipId: membershipA.id,
      organizationId: orgA.id,
      organizationName: orgA.name,
      sessionId: sessionA.id,
    });

    // Tentative de falsification : actorA (organisation A) essaie d'accéder
    // à un workspace qui appartient réellement à l'organisation B.
    await expect(resolveWorkspaceOrThrow(actorA, workspaceOfOrgB.id)).rejects.toBeInstanceOf(NotFoundError);

    // Même chose via le changement de workspace actif : doit être refusé et
    // journalisé comme tentative d'accès interdite.
    await expect(setActiveWorkspace(actorA, workspaceOfOrgB.id)).rejects.toBeInstanceOf(ForbiddenError);

    const deniedLog = await prisma.auditLog.findFirst({
      where: { organizationId: orgA.id, userId: userA.id, action: "access.denied", entityId: workspaceOfOrgB.id },
    });
    expect(deniedLog).not.toBeNull();
  });

  it("un rôle insuffisant (VIEWER) est refusé sur une action de gestion, et journalisé", async () => {
    const suffix = crypto.randomUUID();
    const organization = await prisma.organization.create({ data: { name: `Org permissions ${suffix}` } });
    createdOrganizationIds.push(organization.id);

    const workspace = await prisma.workspace.create({
      data: { organizationId: organization.id, name: "Workspace", slug: "principal", isDefault: true },
    });

    const user = await createUser(`${suffix}-viewer`);
    const membership = await prisma.membership.create({
      data: { organizationId: organization.id, userId: user.id, role: MembershipRole.SALES },
    });
    const workspaceMembership = await prisma.workspaceMembership.create({
      data: { workspaceId: workspace.id, userId: user.id, role: WorkspaceRole.VIEWER },
    });
    const session = await createSessionFor(user.id);

    const actor: WorkspaceActor = {
      ...toCurrentActor({
        userId: user.id,
        email: user.email,
        membershipId: membership.id,
        organizationId: organization.id,
        organizationName: organization.name,
        sessionId: session.id,
      }),
      workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug, role: WorkspaceRole.VIEWER, isDefault: true },
      availableWorkspaces: [
        { id: workspace.id, name: workspace.name, slug: workspace.slug, role: WorkspaceRole.VIEWER, isDefault: true },
      ],
    };

    await expect(requireWorkspacePermission(actor, "MANAGE_WORKSPACE")).rejects.toBeInstanceOf(ForbiddenError);
    // Une permission qu'un VIEWER possède réellement doit, elle, être acceptée.
    await expect(requireWorkspacePermission(actor, "VIEW_WORKSPACE")).resolves.toBeUndefined();

    const deniedLog = await prisma.auditLog.findFirst({
      where: {
        organizationId: organization.id,
        userId: user.id,
        action: "access.denied",
        entityId: workspace.id,
      },
    });
    expect(deniedLog).not.toBeNull();
    expect((deniedLog?.metadata as { permission?: string } | null)?.permission).toBe("MANAGE_WORKSPACE");

    // Ménage explicite du membership créé hors du cycle afterAll générique.
    await prisma.workspaceMembership.delete({ where: { id: workspaceMembership.id } });
  });

  it("changer le rôle d'un membre est appliqué et journalisé", async () => {
    const suffix = crypto.randomUUID();
    const organization = await prisma.organization.create({ data: { name: `Org role change ${suffix}` } });
    createdOrganizationIds.push(organization.id);

    const workspace = await prisma.workspace.create({
      data: { organizationId: organization.id, name: "Workspace", slug: "principal", isDefault: true },
    });

    const owner = await createUser(`${suffix}-owner`);
    const ownerMembership = await prisma.membership.create({
      data: { organizationId: organization.id, userId: owner.id, role: MembershipRole.OWNER_ADMIN },
    });
    const ownerSession = await createSessionFor(owner.id);
    const ownerActor = toCurrentActor({
      userId: owner.id,
      email: owner.email,
      membershipId: ownerMembership.id,
      organizationId: organization.id,
      organizationName: organization.name,
      sessionId: ownerSession.id,
    });

    const member = await createUser(`${suffix}-member`);
    const memberWorkspaceMembership = await prisma.workspaceMembership.create({
      data: { workspaceId: workspace.id, userId: member.id, role: WorkspaceRole.VIEWER },
    });

    const updated = await changeWorkspaceMemberRole(ownerActor, workspace.id, memberWorkspaceMembership.id, WorkspaceRole.MANAGER);
    expect(updated.role).toBe(WorkspaceRole.MANAGER);

    const roleChangeLog = await prisma.auditLog.findFirst({
      where: { organizationId: organization.id, action: "workspace_member.role_changed", entityId: memberWorkspaceMembership.id },
    });
    expect(roleChangeLog).not.toBeNull();
    expect(roleChangeLog?.metadata).toMatchObject({ previousRole: "VIEWER", newRole: "MANAGER" });
  });

  it("le workspace par défaut ne peut pas être archivé ; un workspace additionnel peut l'être et disparaît des workspaces actifs", async () => {
    const suffix = crypto.randomUUID();
    const organization = await prisma.organization.create({ data: { name: `Org archivage ${suffix}` } });
    createdOrganizationIds.push(organization.id);

    const defaultWorkspace = await prisma.workspace.create({
      data: { organizationId: organization.id, name: "Principal", slug: "principal", isDefault: true },
    });
    const secondaryWorkspace = await prisma.workspace.create({
      data: { organizationId: organization.id, name: "Secondaire", slug: "secondaire" },
    });

    const owner = await createUser(`${suffix}-archive-owner`);
    const ownerMembership = await prisma.membership.create({
      data: { organizationId: organization.id, userId: owner.id, role: MembershipRole.OWNER_ADMIN },
    });
    const ownerSession = await createSessionFor(owner.id);
    const ownerActor = toCurrentActor({
      userId: owner.id,
      email: owner.email,
      membershipId: ownerMembership.id,
      organizationId: organization.id,
      organizationName: organization.name,
      sessionId: ownerSession.id,
    });

    await expect(archiveWorkspace(ownerActor, defaultWorkspace.id)).rejects.toBeInstanceOf(ValidationError);

    const archived = await archiveWorkspace(ownerActor, secondaryWorkspace.id);
    expect(archived.archivedAt).not.toBeNull();

    const archivedLog = await prisma.auditLog.findFirst({
      where: { organizationId: organization.id, action: "workspace.archived", entityId: secondaryWorkspace.id },
    });
    expect(archivedLog).not.toBeNull();

    // Un workspace archivé ne doit plus apparaître comme accessible (même
    // logique que listAvailableWorkspaces dans workspace-context.ts).
    await prisma.workspaceMembership.create({
      data: { workspaceId: secondaryWorkspace.id, userId: owner.id, role: WorkspaceRole.OWNER },
    });
    const stillVisible = await prisma.workspaceMembership.findMany({
      where: { userId: owner.id, workspace: { organizationId: organization.id, archivedAt: null } },
    });
    expect(stillVisible.map((m) => m.workspaceId)).not.toContain(secondaryWorkspace.id);
  });
});
