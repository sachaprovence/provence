import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createWebhookSubscription, listWebhookSubscriptions } from "@/lib/settings/webhook-subscriptions-service";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";
import { expectNoCrossTenantLeak } from "../helpers/tenant-isolation";

/**
 * Isolation multi-tenant — Souscriptions webhook sortant (v1.0, AR-0061/
 * AR-0055). Le secret HMAC d'une organisation ne doit jamais être lisible
 * pour une autre, et une souscription ne doit jamais apparaître dans la
 * liste d'une autre organisation.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("isolation multi-tenant — WebhookSubscription", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  it("listWebhookSubscriptions ne renvoie jamais la souscription d'une autre organisation", async () => {
    const fixtureA = await createWorkflowTestFixture("webhook-sub-isolation-a");
    organizationIds.push(fixtureA.organization.id);
    userIds.push(fixtureA.user.id);
    const fixtureB = await createWorkflowTestFixture("webhook-sub-isolation-b");
    organizationIds.push(fixtureB.organization.id);
    userIds.push(fixtureB.user.id);

    const { preview: subA } = await createWebhookSubscription({
      organizationId: fixtureA.organization.id,
      url: "https://example.test/a",
      eventTypes: ["lead.created"],
      createdById: fixtureA.user.id,
    });
    const { preview: subB } = await createWebhookSubscription({
      organizationId: fixtureB.organization.id,
      url: "https://example.test/b",
      eventTypes: ["lead.created"],
      createdById: fixtureB.user.id,
    });

    await expectNoCrossTenantLeak({
      actorAItems: () => listWebhookSubscriptions(fixtureA.organization.id),
      actorBItems: () => listWebhookSubscriptions(fixtureB.organization.id),
      actorAOwnResourceId: subA.id,
      actorBOwnResourceId: subB.id,
      getId: (s) => s.id,
    });
  });

  it("le secret HMAC d'une organisation n'est jamais lisible via la ligne d'une autre", async () => {
    const fixtureA = await createWorkflowTestFixture("webhook-sub-isolation-secret-a");
    organizationIds.push(fixtureA.organization.id);
    userIds.push(fixtureA.user.id);
    const fixtureB = await createWorkflowTestFixture("webhook-sub-isolation-secret-b");
    organizationIds.push(fixtureB.organization.id);
    userIds.push(fixtureB.user.id);

    const { secret: secretA } = await createWebhookSubscription({
      organizationId: fixtureA.organization.id,
      url: "https://example.test/a",
      eventTypes: ["lead.created"],
      createdById: fixtureA.user.id,
    });

    const rowsForB = await prisma.webhookSubscription.findMany({ where: { organizationId: fixtureB.organization.id } });
    expect(rowsForB.some((row) => row.secret === secretA)).toBe(false);
    expect(rowsForB).toHaveLength(0);
  });
});
