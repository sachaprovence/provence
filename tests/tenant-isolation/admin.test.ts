import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { assertPlatformAdmin } from "@/lib/platform-admin";
import { ForbiddenError } from "@/lib/errors";
import {
  changeOrganizationPlanAsAdmin,
  suspendOrganizationAsAdmin,
  reactivateOrganizationAsAdmin,
  getOrganizationDetailForAdmin,
} from "@/lib/admin/admin-service";
import { PlanKey, SubscriptionStatus } from "@/generated/prisma/enums";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";

/**
 * Administration PLATEFORME — isolation (v1.4, AR-0185). Contrairement au
 * reste de l'application, l'admin plateforme traverse volontairement TOUTES
 * les organisations (voir `admin-service.ts`) : l'isolation à vérifier ici
 * n'est donc pas "un acteur ne voit jamais une autre organisation", mais (a)
 * `assertPlatformAdmin` bloque bien tout acteur qui n'est pas
 * `isPlatformAdmin` — seule garde en amont des fonctions de service,
 * jamais revérifiée à l'intérieur (voir le commentaire d'en-tête
 * d'`admin-service.ts`) — et (b) une action ciblant l'organisation A ne
 * modifie jamais l'organisation B. Les 8 routes `/api/admin/**` appellent
 * chacune `requirePlatformAdminApi` avant tout appel de service (vérifié
 * par lecture de code : aucune route n'en fait l'économie) ; `getCurrentActor`
 * dépend de `next/headers` et n'est donc pas rejouable hors contexte de
 * requête, d'où ce test au niveau du garde pur (`assertPlatformAdmin`) et
 * des fonctions de service, comme le fait déjà `admin-service.test.ts`.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("isolation/permissions — administration plateforme", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  describe("assertPlatformAdmin", () => {
    it("refuse tout acteur qui n'est pas isPlatformAdmin", async () => {
      const fixture = await createWorkflowTestFixture("admin-guard-non-admin");
      organizationIds.push(fixture.organization.id);
      userIds.push(fixture.user.id);

      expect(() => assertPlatformAdmin(fixture.actor)).toThrow(ForbiddenError);
    });

    it("laisse passer un acteur isPlatformAdmin", async () => {
      const fixture = await createWorkflowTestFixture("admin-guard-admin");
      organizationIds.push(fixture.organization.id);
      userIds.push(fixture.user.id);
      const platformAdminActor = { ...fixture.actor, isPlatformAdmin: true };

      expect(() => assertPlatformAdmin(platformAdminActor)).not.toThrow();
    });
  });

  describe("scoping des actions d'administration", () => {
    it("changeOrganizationPlanAsAdmin sur l'organisation A ne modifie jamais le plan de l'organisation B", async () => {
      const fixtureA = await createWorkflowTestFixture("admin-scope-plan-a");
      const fixtureB = await createWorkflowTestFixture("admin-scope-plan-b");
      organizationIds.push(fixtureA.organization.id, fixtureB.organization.id);
      userIds.push(fixtureA.user.id, fixtureB.user.id);

      await changeOrganizationPlanAsAdmin(fixtureA.actor, fixtureA.organization.id, PlanKey.ENTERPRISE);

      const orgB = await prisma.organization.findUniqueOrThrow({ where: { id: fixtureB.organization.id } });
      expect(orgB.planId).toBeNull();

      const auditForB = await prisma.auditLog.findFirst({
        where: { organizationId: fixtureB.organization.id, action: "admin.organization_plan_changed" },
      });
      expect(auditForB).toBeNull();
    });

    it("suspendOrganizationAsAdmin sur l'organisation A ne suspend jamais l'organisation B", async () => {
      const fixtureA = await createWorkflowTestFixture("admin-scope-suspend-a");
      const fixtureB = await createWorkflowTestFixture("admin-scope-suspend-b");
      organizationIds.push(fixtureA.organization.id, fixtureB.organization.id);
      userIds.push(fixtureA.user.id, fixtureB.user.id);

      await suspendOrganizationAsAdmin(fixtureA.actor, fixtureA.organization.id);

      const orgB = await prisma.organization.findUniqueOrThrow({ where: { id: fixtureB.organization.id } });
      expect(orgB.subscriptionStatus).not.toBe(SubscriptionStatus.RESTRICTED);
    });

    it("reactivateOrganizationAsAdmin ne réactive jamais une organisation suspendue autre que la cible", async () => {
      const fixtureA = await createWorkflowTestFixture("admin-scope-reactivate-a");
      const fixtureB = await createWorkflowTestFixture("admin-scope-reactivate-b");
      organizationIds.push(fixtureA.organization.id, fixtureB.organization.id);
      userIds.push(fixtureA.user.id, fixtureB.user.id);

      await suspendOrganizationAsAdmin(fixtureA.actor, fixtureA.organization.id);
      await suspendOrganizationAsAdmin(fixtureA.actor, fixtureB.organization.id);

      await reactivateOrganizationAsAdmin(fixtureA.actor, fixtureA.organization.id);

      const orgA = await prisma.organization.findUniqueOrThrow({ where: { id: fixtureA.organization.id } });
      const orgB = await prisma.organization.findUniqueOrThrow({ where: { id: fixtureB.organization.id } });
      expect(orgA.subscriptionStatus).toBe(SubscriptionStatus.ACTIVE);
      expect(orgB.subscriptionStatus).toBe(SubscriptionStatus.RESTRICTED);
    });

    it("getOrganizationDetailForAdmin ne mélange jamais les membres/l'usage de deux organisations", async () => {
      const fixtureA = await createWorkflowTestFixture("admin-scope-detail-a");
      const fixtureB = await createWorkflowTestFixture("admin-scope-detail-b");
      organizationIds.push(fixtureA.organization.id, fixtureB.organization.id);
      userIds.push(fixtureA.user.id, fixtureB.user.id);

      const detailA = await getOrganizationDetailForAdmin(fixtureA.organization.id);
      expect(detailA.members).toHaveLength(1);
      expect(detailA.members[0].email).toBe(fixtureA.user.email);
      expect(detailA.members.map((m) => m.email)).not.toContain(fixtureB.user.email);
    });
  });
});
