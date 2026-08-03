import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { startOrganizationCheckout, getOrganizationBillingSummary } from "@/lib/billing/subscription-service";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";
import { PlanKey } from "@/generated/prisma/enums";

/**
 * Isolation multi-tenant — Facturation (v1.0, AR-0063/AR-0055). L'abonnement
 * d'une organisation (identifiant client, identifiant d'abonnement,
 * consommation de quota) ne doit jamais être lisible ni affecté par les
 * actions d'une autre organisation.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("isolation multi-tenant — abonnement/facturation", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  it("le changement de plan d'une organisation n'affecte jamais les quotas d'une autre", async () => {
    const fixtureA = await createWorkflowTestFixture("billing-isolation-a");
    organizationIds.push(fixtureA.organization.id);
    userIds.push(fixtureA.user.id);
    const fixtureB = await createWorkflowTestFixture("billing-isolation-b");
    organizationIds.push(fixtureB.organization.id);
    userIds.push(fixtureB.user.id);

    await startOrganizationCheckout({
      organizationId: fixtureA.organization.id,
      planKey: PlanKey.ENTERPRISE,
      requesterEmail: "a@b.test",
      requesterName: "Test",
      successUrl: "https://x/s",
      cancelUrl: "https://x/c",
    });

    const summaryB = await getOrganizationBillingSummary(fixtureB.organization.id);
    expect(summaryB.plan).toBeNull();
    expect(summaryB.hasActiveSubscription).toBe(false);

    const rawB = await prisma.organization.findUniqueOrThrow({ where: { id: fixtureB.organization.id } });
    expect(rawB.billingCustomerId).toBeNull();
    expect(rawB.billingSubscriptionId).toBeNull();
  });

  it("l'identifiant client de facturation d'une organisation n'est jamais visible sur une autre ligne", async () => {
    const fixtureA = await createWorkflowTestFixture("billing-isolation-customer-a");
    organizationIds.push(fixtureA.organization.id);
    userIds.push(fixtureA.user.id);
    const fixtureB = await createWorkflowTestFixture("billing-isolation-customer-b");
    organizationIds.push(fixtureB.organization.id);
    userIds.push(fixtureB.user.id);

    await startOrganizationCheckout({
      organizationId: fixtureA.organization.id,
      planKey: PlanKey.STARTER,
      requesterEmail: "a@b.test",
      requesterName: "Test",
      successUrl: "https://x/s",
      cancelUrl: "https://x/c",
    });

    const orgA = await prisma.organization.findUniqueOrThrow({ where: { id: fixtureA.organization.id } });
    const rowsForB = await prisma.organization.findMany({ where: { id: fixtureB.organization.id, billingCustomerId: orgA.billingCustomerId } });
    expect(rowsForB).toHaveLength(0);
  });
});
