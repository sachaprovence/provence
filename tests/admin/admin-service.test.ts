import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  listOrganizationsForAdmin,
  getOrganizationDetailForAdmin,
  changeOrganizationPlanAsAdmin,
  suspendOrganizationAsAdmin,
  reactivateOrganizationAsAdmin,
} from "@/lib/admin/admin-service";
import { PlanKey, SubscriptionStatus } from "@/generated/prisma/enums";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";

/**
 * Administration plateforme (v1.4, AR-0185) — vérifie que les actions
 * (changement de plan, suspension, réactivation) fonctionnent réellement,
 * sont journalisées (AuditLog), et que la suspension réutilise bien
 * `SubscriptionStatus.RESTRICTED` (déjà existant) plutôt qu'un nouveau
 * statut. La garde d'accès (`requirePlatformAdminPage`/`Api`) est testée
 * séparément via le comportement de redirection/403, pas ici (fonctions de
 * service pures, appelées seulement après la garde).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("admin-service (v1.4, AR-0185)", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  it("listOrganizationsForAdmin renvoie les organisations avec plan/statut/nombre de membres", async () => {
    const fixture = await createWorkflowTestFixture("admin-list-orgs");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const organizations = await listOrganizationsForAdmin({ search: fixture.organization.name });
    expect(organizations).toHaveLength(1);
    expect(organizations[0].id).toBe(fixture.organization.id);
    expect(organizations[0].memberCount).toBe(1);
  });

  it("changeOrganizationPlanAsAdmin applique le plan et journalise l'action", async () => {
    const fixture = await createWorkflowTestFixture("admin-change-plan");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const updated = await changeOrganizationPlanAsAdmin(fixture.actor, fixture.organization.id, PlanKey.PRO);
    const proPlan = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.PRO } });
    expect(updated.planId).toBe(proPlan.id);

    const auditEntry = await prisma.auditLog.findFirst({
      where: { organizationId: fixture.organization.id, action: "admin.organization_plan_changed" },
    });
    expect(auditEntry).not.toBeNull();
  });

  it("suspendOrganizationAsAdmin/reactivateOrganizationAsAdmin réutilisent SubscriptionStatus.RESTRICTED/ACTIVE", async () => {
    const fixture = await createWorkflowTestFixture("admin-suspend");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const suspended = await suspendOrganizationAsAdmin(fixture.actor, fixture.organization.id);
    expect(suspended.subscriptionStatus).toBe(SubscriptionStatus.RESTRICTED);

    const reactivated = await reactivateOrganizationAsAdmin(fixture.actor, fixture.organization.id);
    expect(reactivated.subscriptionStatus).toBe(SubscriptionStatus.ACTIVE);

    const auditActions = await prisma.auditLog.findMany({
      where: { organizationId: fixture.organization.id, action: { in: ["admin.organization_suspended", "admin.organization_reactivated"] } },
    });
    expect(auditActions).toHaveLength(2);
  });

  it("getOrganizationDetailForAdmin inclut les membres et l'usage vs plan", async () => {
    const fixture = await createWorkflowTestFixture("admin-detail");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    await changeOrganizationPlanAsAdmin(fixture.actor, fixture.organization.id, PlanKey.STARTER);

    const detail = await getOrganizationDetailForAdmin(fixture.organization.id);
    expect(detail.members).toHaveLength(1);
    expect(detail.plan?.key).toBe(PlanKey.STARTER);
    expect(detail.usage.members.used).toBe(1);
  });
});
