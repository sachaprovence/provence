import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { transferOrganizationOwnership, removeOrganizationMember } from "@/lib/organization-service";
import { ForbiddenError, ValidationError, NotFoundError, ConflictError } from "@/lib/errors";
import { MembershipRole, WorkspaceRole } from "@/generated/prisma/enums";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";

/**
 * Transfert de propriété + retrait de membre d'organisation (v1.4, AR-0178).
 * Vérifie aussi l'isolation multi-tenant stricte : les identifiants d'une
 * autre organisation ne doivent jamais être résolus par ces opérations.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("organization-service (v1.4, AR-0178)", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  async function addMember(organizationId: string, workspaceId: string, suffix: string, role: MembershipRole = MembershipRole.SALES) {
    const user = await prisma.user.create({
      data: { email: `member-${suffix}@example.test`, passwordHash: "not-a-real-hash", firstName: "Membre", lastName: suffix },
    });
    userIds.push(user.id);
    const membership = await prisma.membership.create({ data: { organizationId, userId: user.id, role } });
    await prisma.workspaceMembership.create({ data: { workspaceId, userId: user.id, role: WorkspaceRole.COMMERCIAL } });
    return { user, membership };
  }

  describe("transferOrganizationOwnership", () => {
    it("transfère la propriété : la cible devient OWNER_ADMIN, l'acteur devient SALES", async () => {
      const fixture = await createWorkflowTestFixture("transfer-ok");
      organizationIds.push(fixture.organization.id);
      userIds.push(fixture.user.id);
      const { user: target } = await addMember(fixture.organization.id, fixture.workspace.id, "target-ok");

      await transferOrganizationOwnership(fixture.actor, target.id);

      const targetMembership = await prisma.membership.findFirst({ where: { organizationId: fixture.organization.id, userId: target.id } });
      const actorMembership = await prisma.membership.findUnique({ where: { id: fixture.membership.id } });
      expect(targetMembership?.role).toBe(MembershipRole.OWNER_ADMIN);
      expect(actorMembership?.role).toBe(MembershipRole.SALES);

      const auditEntry = await prisma.auditLog.findFirst({
        where: { organizationId: fixture.organization.id, action: "organization.ownership_transferred" },
      });
      expect(auditEntry).not.toBeNull();
    });

    it("refuse si l'acteur n'est pas OWNER_ADMIN", async () => {
      const fixture = await createWorkflowTestFixture("transfer-forbidden");
      organizationIds.push(fixture.organization.id);
      userIds.push(fixture.user.id);
      const { user: target } = await addMember(fixture.organization.id, fixture.workspace.id, "target-forbidden");
      const nonOwnerActor = { ...fixture.actor, membership: { ...fixture.actor.membership, role: MembershipRole.SALES } };

      await expect(transferOrganizationOwnership(nonOwnerActor, target.id)).rejects.toThrow(ForbiddenError);
    });

    it("refuse un transfert vers soi-même", async () => {
      const fixture = await createWorkflowTestFixture("transfer-self");
      organizationIds.push(fixture.organization.id);
      userIds.push(fixture.user.id);

      await expect(transferOrganizationOwnership(fixture.actor, fixture.user.id)).rejects.toThrow(ValidationError);
    });

    it("refuse un transfert vers un utilisateur d'une AUTRE organisation (isolation multi-tenant)", async () => {
      const fixtureA = await createWorkflowTestFixture("transfer-tenant-a");
      const fixtureB = await createWorkflowTestFixture("transfer-tenant-b");
      organizationIds.push(fixtureA.organization.id, fixtureB.organization.id);
      userIds.push(fixtureA.user.id, fixtureB.user.id);

      await expect(transferOrganizationOwnership(fixtureA.actor, fixtureB.user.id)).rejects.toThrow(NotFoundError);
    });
  });

  describe("removeOrganizationMember", () => {
    it("retire la Membership ET les WorkspaceMembership de l'organisation", async () => {
      const fixture = await createWorkflowTestFixture("remove-ok");
      organizationIds.push(fixture.organization.id);
      userIds.push(fixture.user.id);
      const { user: target, membership: targetMembership } = await addMember(fixture.organization.id, fixture.workspace.id, "target-remove");

      await removeOrganizationMember(fixture.actor, targetMembership.id);

      const remainingMembership = await prisma.membership.findUnique({ where: { id: targetMembership.id } });
      const remainingWorkspaceMembership = await prisma.workspaceMembership.findFirst({
        where: { userId: target.id, workspaceId: fixture.workspace.id },
      });
      expect(remainingMembership).toBeNull();
      expect(remainingWorkspaceMembership).toBeNull();

      const auditEntry = await prisma.auditLog.findFirst({
        where: { organizationId: fixture.organization.id, action: "organization.member_removed" },
      });
      expect(auditEntry).not.toBeNull();
    });

    it("refuse de retirer le dernier OWNER_ADMIN de l'organisation", async () => {
      const fixture = await createWorkflowTestFixture("remove-last-owner");
      organizationIds.push(fixture.organization.id);
      userIds.push(fixture.user.id);

      await expect(removeOrganizationMember(fixture.actor, fixture.membership.id)).rejects.toThrow(ConflictError);
    });

    it("autorise de retirer un OWNER_ADMIN s'il en reste un autre", async () => {
      const fixture = await createWorkflowTestFixture("remove-owner-with-backup");
      organizationIds.push(fixture.organization.id);
      userIds.push(fixture.user.id);
      const { membership: secondOwnerMembership } = await addMember(
        fixture.organization.id,
        fixture.workspace.id,
        "second-owner",
        MembershipRole.OWNER_ADMIN
      );

      await removeOrganizationMember(fixture.actor, secondOwnerMembership.id);

      const remaining = await prisma.membership.findUnique({ where: { id: secondOwnerMembership.id } });
      expect(remaining).toBeNull();
    });

    it("ne trouve jamais une Membership d'une AUTRE organisation (isolation multi-tenant)", async () => {
      const fixtureA = await createWorkflowTestFixture("remove-tenant-a");
      const fixtureB = await createWorkflowTestFixture("remove-tenant-b");
      organizationIds.push(fixtureA.organization.id, fixtureB.organization.id);
      userIds.push(fixtureA.user.id, fixtureB.user.id);

      await expect(removeOrganizationMember(fixtureA.actor, fixtureB.membership.id)).rejects.toThrow(NotFoundError);

      const stillThere = await prisma.membership.findUnique({ where: { id: fixtureB.membership.id } });
      expect(stillThere).not.toBeNull();
    });
  });
});
