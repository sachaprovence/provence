import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerOutboundWebhookListeners } from "@/lib/webhooks-outbound";
import { publishAutomationEvent } from "@/lib/automation/triggers/event-dispatcher";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";

/**
 * Webhooks sortants (v1.0, AR-0061) — s'abonnent au bus d'évènements
 * générique déjà existant plutôt que d'introduire de nouveaux points de
 * déclenchement. Vérifie : une souscription active reçoit bien une
 * `WebhookDelivery` PENDING pour un évènement auquel elle est abonnée,
 * jamais pour un évènement non souscrit ni pour une souscription
 * inactive, et jamais pour une autre organisation.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("registerOutboundWebhookListeners", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  async function createSubscription(organizationId: string, eventTypes: string[], isActive = true) {
    return prisma.webhookSubscription.create({
      data: { organizationId, url: "https://example.test/hook", secret: "test-secret", eventTypes, isActive },
    });
  }

  it("crée une WebhookDelivery PENDING pour une souscription active abonnée à l'évènement publié", async () => {
    registerOutboundWebhookListeners();
    const fixture = await createWorkflowTestFixture("webhook-outbound-basic");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    const subscription = await createSubscription(fixture.organization.id, ["lead.created"]);

    await publishAutomationEvent("lead.created", { organizationId: fixture.organization.id, leadId: "lead-test-1" });
    // Le bus d'évènements exécute les abonnés de façon asynchrone mais séquentielle — publishAutomationEvent attend déjà leur résolution.

    const deliveries = await prisma.webhookDelivery.findMany({ where: { subscriptionId: subscription.id } });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].status).toBe("PENDING");
    expect(deliveries[0].eventType).toBe("lead.created");
    expect((deliveries[0].payload as { leadId?: string }).leadId).toBe("lead-test-1");
  });

  it("ne crée jamais de livraison pour un évènement auquel la souscription n'est pas abonnée", async () => {
    registerOutboundWebhookListeners();
    const fixture = await createWorkflowTestFixture("webhook-outbound-not-subscribed");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    const subscription = await createSubscription(fixture.organization.id, ["invoice.paid"]);

    await publishAutomationEvent("lead.created", { organizationId: fixture.organization.id, leadId: "lead-test-2" });

    const deliveries = await prisma.webhookDelivery.findMany({ where: { subscriptionId: subscription.id } });
    expect(deliveries).toHaveLength(0);
  });

  it("ne crée jamais de livraison pour une souscription inactive", async () => {
    registerOutboundWebhookListeners();
    const fixture = await createWorkflowTestFixture("webhook-outbound-inactive");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    const subscription = await createSubscription(fixture.organization.id, ["lead.created"], false);

    await publishAutomationEvent("lead.created", { organizationId: fixture.organization.id, leadId: "lead-test-3" });

    const deliveries = await prisma.webhookDelivery.findMany({ where: { subscriptionId: subscription.id } });
    expect(deliveries).toHaveLength(0);
  });

  it("isolation multi-tenant : un évènement d'une organisation ne déclenche jamais la souscription d'une autre", async () => {
    registerOutboundWebhookListeners();
    const fixtureA = await createWorkflowTestFixture("webhook-outbound-tenant-a");
    organizationIds.push(fixtureA.organization.id);
    userIds.push(fixtureA.user.id);
    const fixtureB = await createWorkflowTestFixture("webhook-outbound-tenant-b");
    organizationIds.push(fixtureB.organization.id);
    userIds.push(fixtureB.user.id);
    const subscriptionB = await createSubscription(fixtureB.organization.id, ["lead.created"]);

    await publishAutomationEvent("lead.created", { organizationId: fixtureA.organization.id, leadId: "lead-test-4" });

    const deliveries = await prisma.webhookDelivery.findMany({ where: { subscriptionId: subscriptionB.id } });
    expect(deliveries).toHaveLength(0);
  });

  it("plusieurs souscriptions actives de la même organisation reçoivent chacune leur propre livraison", async () => {
    registerOutboundWebhookListeners();
    const fixture = await createWorkflowTestFixture("webhook-outbound-multi");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    const subscription1 = await createSubscription(fixture.organization.id, ["quote.signed"]);
    const subscription2 = await createSubscription(fixture.organization.id, ["quote.signed"]);

    await publishAutomationEvent("quote.signed", { organizationId: fixture.organization.id, quoteId: "quote-test-1" });

    const deliveries1 = await prisma.webhookDelivery.findMany({ where: { subscriptionId: subscription1.id } });
    const deliveries2 = await prisma.webhookDelivery.findMany({ where: { subscriptionId: subscription2.id } });
    expect(deliveries1).toHaveLength(1);
    expect(deliveries2).toHaveLength(1);
    expect(deliveries1[0].idempotencyKey).not.toBe(deliveries2[0].idempotencyKey);
  });
});
