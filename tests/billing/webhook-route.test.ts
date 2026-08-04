import crypto from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { POST as billingWebhookRoute } from "@/app/api/billing/webhook/route";
import { SubscriptionStatus } from "@/generated/prisma/enums";

/**
 * Route `POST /api/billing/webhook` (v1.0, AR-0063) — pas d'authentification
 * par session (appelant externe, Stripe), donc testable directement
 * (contrairement aux routes `/api/billing/{checkout,change-plan,cancel}` et
 * `/api/settings/billing`, qui appellent `requireActorApi()` → `next/headers`,
 * voir la contrainte documentée dans DEVELOPMENT_GUIDE.md §0 undecies).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env.BILLING_PROVIDER = ORIGINAL_ENV.BILLING_PROVIDER;
  process.env.STRIPE_WEBHOOK_SECRET = ORIGINAL_ENV.STRIPE_WEBHOOK_SECRET;
});

runIfDatabase("POST /api/billing/webhook", () => {
  const organizationIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  it("traite un évènement Stripe signé valide et renvoie processed: true", async () => {
    process.env.BILLING_PROVIDER = "stripe";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_route_test";
    const organization = await prisma.organization.create({
      data: { name: "Org webhook route", billingCustomerId: "cus_route_test", subscriptionStatus: SubscriptionStatus.ACTIVE },
    });
    organizationIds.push(organization.id);

    const payload = JSON.stringify({
      id: `evt_route_${organization.id}`,
      type: "invoice.payment_failed",
      data: { object: { customer: "cus_route_test" } },
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto.createHmac("sha256", "whsec_route_test").update(`${timestamp}.${payload}`).digest("hex");

    const request = new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
      body: payload,
    });

    const response = await billingWebhookRoute(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.processed).toBe(true);

    const updated = await prisma.organization.findUniqueOrThrow({ where: { id: organization.id } });
    expect(updated.subscriptionStatus).toBe(SubscriptionStatus.RESTRICTED);
  });

  it("rejette explicitement une signature invalide (jamais un traitement silencieux)", async () => {
    process.env.BILLING_PROVIDER = "stripe";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_route_test";

    const request = new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: { "stripe-signature": "t=123,v1=falsifiee" },
      body: JSON.stringify({ id: "evt_bad", type: "invoice.payment_failed", data: { object: {} } }),
    });

    const response = await billingWebhookRoute(request);
    expect(response.status).toBe(400);
  });
});
