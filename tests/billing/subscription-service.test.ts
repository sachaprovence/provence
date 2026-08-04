import crypto from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  startOrganizationCheckout,
  changeOrganizationPlan,
  cancelOrganizationSubscription,
  getOrganizationBillingSummary,
  handleBillingWebhookEvent,
} from "@/lib/billing/subscription-service";
import { getPlanByKey } from "@/lib/billing/plan-service";
import { ValidationError } from "@/lib/errors";
import { PlanKey, SubscriptionStatus } from "@/generated/prisma/enums";

/**
 * Cycle de vie de l'abonnement (v1.0, AR-0063) — mode démo (activation
 * synchrone, sans configuration externe) et mode réel (webhook Stripe
 * signé, idempotent). Vérifie les 2 critères de sortie explicites de
 * MILESTONES.md §v1.0 : un changement de plan applique immédiatement les
 * nouveaux quotas ; un échec de paiement bascule l'organisation en statut
 * RESTRICTED sans perte de données.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env.BILLING_PROVIDER = ORIGINAL_ENV.BILLING_PROVIDER;
  process.env.STRIPE_WEBHOOK_SECRET = ORIGINAL_ENV.STRIPE_WEBHOOK_SECRET;
});

runIfDatabase("startOrganizationCheckout / changeOrganizationPlan / cancelOrganizationSubscription (mode démo)", () => {
  const organizationIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  async function createOrg(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org checkout ${suffix}` } });
    organizationIds.push(organization.id);
    return organization;
  }

  it("active immédiatement l'abonnement en mode démo et applique les quotas du plan", async () => {
    delete process.env.BILLING_PROVIDER;
    const organization = await createOrg("demo-activate");
    const starter = await getPlanByKey(PlanKey.STARTER);

    const outcome = await startOrganizationCheckout({
      organizationId: organization.id,
      planKey: PlanKey.STARTER,
      requesterEmail: "a@b.test",
      requesterName: "Test User",
      successUrl: "https://x/s",
      cancelUrl: "https://x/c",
    });

    expect(outcome.checkoutUrl).toBeNull();
    expect(outcome.activated).toBe(true);

    const updated = await prisma.organization.findUniqueOrThrow({ where: { id: organization.id } });
    expect(updated.subscriptionStatus).toBe(SubscriptionStatus.ACTIVE);
    expect(updated.dailySendLimit).toBe(starter.dailySendLimit);
    expect(updated.billingSubscriptionId).toMatch(/^demo-sub-/);
  });

  it("changeOrganizationPlan met à jour les quotas immédiatement", async () => {
    const organization = await createOrg("demo-change-plan");
    await startOrganizationCheckout({
      organizationId: organization.id,
      planKey: PlanKey.STARTER,
      requesterEmail: "a@b.test",
      requesterName: "Test User",
      successUrl: "https://x/s",
      cancelUrl: "https://x/c",
    });

    const pro = await getPlanByKey(PlanKey.PRO);
    await changeOrganizationPlan(organization.id, PlanKey.PRO);

    const updated = await prisma.organization.findUniqueOrThrow({ where: { id: organization.id } });
    expect(updated.planId).toBe(pro.id);
    expect(updated.dailySendLimit).toBe(pro.dailySendLimit);
  });

  it("changeOrganizationPlan échoue explicitement sans abonnement actif", async () => {
    const organization = await createOrg("demo-no-sub");
    await expect(changeOrganizationPlan(organization.id, PlanKey.PRO)).rejects.toBeInstanceOf(ValidationError);
  });

  it("cancelOrganizationSubscription marque CANCELED avec une date d'annulation", async () => {
    const organization = await createOrg("demo-cancel");
    await startOrganizationCheckout({
      organizationId: organization.id,
      planKey: PlanKey.STARTER,
      requesterEmail: "a@b.test",
      requesterName: "Test User",
      successUrl: "https://x/s",
      cancelUrl: "https://x/c",
    });

    await cancelOrganizationSubscription(organization.id);

    const updated = await prisma.organization.findUniqueOrThrow({ where: { id: organization.id } });
    expect(updated.subscriptionStatus).toBe(SubscriptionStatus.CANCELED);
    expect(updated.subscriptionCanceledAt).not.toBeNull();
  });

  it("cancelOrganizationSubscription échoue explicitement sans abonnement actif", async () => {
    const organization = await createOrg("demo-cancel-none");
    await expect(cancelOrganizationSubscription(organization.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it("getOrganizationBillingSummary expose la consommation de quota en temps réel", async () => {
    const organization = await createOrg("demo-summary");
    await startOrganizationCheckout({
      organizationId: organization.id,
      planKey: PlanKey.PRO,
      requesterEmail: "a@b.test",
      requesterName: "Test User",
      successUrl: "https://x/s",
      cancelUrl: "https://x/c",
    });

    const summary = await getOrganizationBillingSummary(organization.id);
    expect(summary.plan?.key).toBe(PlanKey.PRO);
    expect(summary.subscriptionStatus).toBe(SubscriptionStatus.ACTIVE);
    expect(summary.usage.memberCount).toBe(0);
    expect(summary.usage.maxUsers).toBe((await getPlanByKey(PlanKey.PRO)).maxUsers);
  });
});

runIfDatabase("handleBillingWebhookEvent (mode Stripe réel, signature vérifiée)", () => {
  const organizationIds: string[] = [];

  afterAll(async () => {
    await prisma.plan.updateMany({ where: { key: PlanKey.STARTER }, data: { stripePriceId: null } });
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  function signedPayload(event: object) {
    const payload = JSON.stringify(event);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto.createHmac("sha256", "whsec_test_secret").update(`${timestamp}.${payload}`).digest("hex");
    return { rawBody: payload, signatureHeader: `t=${timestamp},v1=${signature}` };
  }

  it("checkout.session.completed active l'abonnement et applique le plan", async () => {
    process.env.BILLING_PROVIDER = "stripe";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
    const organization = await prisma.organization.create({ data: { name: "Org webhook checkout" } });
    organizationIds.push(organization.id);
    const starter = await getPlanByKey(PlanKey.STARTER);

    const { rawBody, signatureHeader } = signedPayload({
      id: `evt_checkout_${organization.id}`,
      type: "checkout.session.completed",
      data: { object: { customer: "cus_1", subscription: "sub_1", metadata: { organizationId: organization.id, planKey: "STARTER" } } },
    });

    const result = await handleBillingWebhookEvent(rawBody, signatureHeader);
    expect(result.processed).toBe(true);

    const updated = await prisma.organization.findUniqueOrThrow({ where: { id: organization.id } });
    expect(updated.subscriptionStatus).toBe(SubscriptionStatus.ACTIVE);
    expect(updated.billingSubscriptionId).toBe("sub_1");
    expect(updated.dailySendLimit).toBe(starter.dailySendLimit);
  });

  it("invoice.payment_failed bascule l'organisation en RESTRICTED sans perte de données", async () => {
    process.env.BILLING_PROVIDER = "stripe";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
    const organization = await prisma.organization.create({
      data: { name: "Org webhook payment failed", billingCustomerId: "cus_payment_failed", subscriptionStatus: SubscriptionStatus.ACTIVE },
    });
    organizationIds.push(organization.id);
    const lead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "Prospect conservé" } });

    const { rawBody, signatureHeader } = signedPayload({
      id: `evt_payment_failed_${organization.id}`,
      type: "invoice.payment_failed",
      data: { object: { customer: "cus_payment_failed" } },
    });

    await handleBillingWebhookEvent(rawBody, signatureHeader);

    const updated = await prisma.organization.findUniqueOrThrow({ where: { id: organization.id } });
    expect(updated.subscriptionStatus).toBe(SubscriptionStatus.RESTRICTED);
    const stillThere = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(stillThere).not.toBeNull();
  });

  it("est idempotent : un même évènement livré deux fois n'est traité qu'une seule fois", async () => {
    process.env.BILLING_PROVIDER = "stripe";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
    const organization = await prisma.organization.create({
      data: { name: "Org webhook idempotence", billingCustomerId: "cus_idempotence", subscriptionStatus: SubscriptionStatus.ACTIVE },
    });
    organizationIds.push(organization.id);

    const { rawBody, signatureHeader } = signedPayload({
      id: `evt_idempotence_${organization.id}`,
      type: "invoice.payment_failed",
      data: { object: { customer: "cus_idempotence" } },
    });

    const first = await handleBillingWebhookEvent(rawBody, signatureHeader);
    const second = await handleBillingWebhookEvent(rawBody, signatureHeader);

    expect(first.processed).toBe(true);
    expect(second.processed).toBe(false);
  });
});
