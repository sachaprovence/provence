import http from "node:http";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { StripeBillingProvider } from "@/lib/billing/providers/stripe";
import { ValidationError } from "@/lib/errors";
import { PlanKey } from "@/generated/prisma/enums";

/**
 * Fournisseur Stripe Billing réel (v1.0, AR-0063) — appels `fetch()`
 * directs (pas de SDK, même convention que Gmail/Outlook/Google Calendar,
 * ADR 0038/0040/0041), vérifiés contre un vrai serveur HTTP local simulant
 * l'API Stripe (jamais un succès simulé sans configuration).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env.STRIPE_SECRET_KEY = ORIGINAL_ENV.STRIPE_SECRET_KEY;
  process.env.STRIPE_WEBHOOK_SECRET = ORIGINAL_ENV.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_API_BASE_URL = ORIGINAL_ENV.STRIPE_API_BASE_URL;
});

describe("StripeBillingProvider — échec explicite sans configuration", () => {
  it("createCustomer échoue explicitement sans STRIPE_SECRET_KEY", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const provider = new StripeBillingProvider();
    await expect(provider.createCustomer({ organizationId: "org-1", email: "a@b.test", name: "Org Test" })).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it("constructWebhookEvent échoue explicitement sans STRIPE_WEBHOOK_SECRET", () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const provider = new StripeBillingProvider();
    expect(() => provider.constructWebhookEvent("{}", "t=123,v1=abc")).toThrow(ValidationError);
  });

  it("constructWebhookEvent échoue explicitement sans en-tête de signature", () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const provider = new StripeBillingProvider();
    expect(() => provider.constructWebhookEvent("{}", null)).toThrow(ValidationError);
  });
});

describe("StripeBillingProvider — contre un vrai serveur HTTP local simulant Stripe", () => {
  let server: http.Server;
  let baseUrl: string;
  let requestLog: { url: string; method: string; body: string }[] = [];
  let responses: Record<string, unknown> = {};

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        requestLog.push({ url: req.url!, method: req.method!, body });
        const key = `${req.method} ${req.url!.split("?")[0]}`;
        const response = responses[key] ?? { id: "unknown" };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.close();
  });

  afterEach(() => {
    requestLog = [];
    responses = {};
  });

  runIfDatabase("createCustomer", () => {
    it("crée un client réel et renvoie son customerId", async () => {
      process.env.STRIPE_SECRET_KEY = "sk_test_x";
      process.env.STRIPE_API_BASE_URL = baseUrl;
      responses["POST /customers"] = { id: "cus_test_123" };

      const provider = new StripeBillingProvider();
      const result = await provider.createCustomer({ organizationId: "org-1", email: "a@b.test", name: "Org Test" });

      expect(result.customerId).toBe("cus_test_123");
      expect(requestLog[0].body).toContain("email=a%40b.test");
      expect(requestLog[0].body).toContain("metadata%5BorganizationId%5D=org-1");
    });
  });

  runIfDatabase("startCheckout", () => {
    const organizationIds: string[] = [];

    afterAll(async () => {
      await prisma.plan.updateMany({ where: { key: PlanKey.STARTER }, data: { stripePriceId: null } });
      await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    });

    it("échoue explicitement si le plan n'a pas de stripePriceId configuré", async () => {
      process.env.STRIPE_SECRET_KEY = "sk_test_x";
      process.env.STRIPE_API_BASE_URL = baseUrl;
      await prisma.plan.updateMany({ where: { key: PlanKey.STARTER }, data: { stripePriceId: null } });

      const provider = new StripeBillingProvider();
      await expect(
        provider.startCheckout({ organizationId: "org-1", customerId: "cus_1", planKey: PlanKey.STARTER, successUrl: "https://x/s", cancelUrl: "https://x/c" })
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("crée une session de paiement réelle et renvoie son URL", async () => {
      process.env.STRIPE_SECRET_KEY = "sk_test_x";
      process.env.STRIPE_API_BASE_URL = baseUrl;
      await prisma.plan.updateMany({ where: { key: PlanKey.STARTER }, data: { stripePriceId: "price_test_starter" } });
      responses["POST /checkout/sessions"] = { url: "https://checkout.stripe.test/session_123" };

      const provider = new StripeBillingProvider();
      const result = await provider.startCheckout({
        organizationId: "org-1",
        customerId: "cus_1",
        planKey: PlanKey.STARTER,
        successUrl: "https://x/s",
        cancelUrl: "https://x/c",
      });

      expect(result.checkoutUrl).toBe("https://checkout.stripe.test/session_123");
      expect(requestLog[0].body).toContain("line_items%5B0%5D%5Bprice%5D=price_test_starter");
      expect(requestLog[0].body).toContain("mode=subscription");
    });
  });

  runIfDatabase("changePlan", () => {
    it("récupère l'abonnement puis met à jour sa ligne avec le nouveau prix", async () => {
      process.env.STRIPE_SECRET_KEY = "sk_test_x";
      process.env.STRIPE_API_BASE_URL = baseUrl;
      await prisma.plan.updateMany({ where: { key: PlanKey.PRO }, data: { stripePriceId: "price_test_pro" } });
      responses["GET /subscriptions/sub_1"] = { items: { data: [{ id: "si_1" }] } };
      responses["POST /subscriptions/sub_1"] = { id: "sub_1" };

      const provider = new StripeBillingProvider();
      await provider.changePlan({ subscriptionId: "sub_1", newPlanKey: PlanKey.PRO });

      expect(requestLog).toHaveLength(2);
      expect(requestLog[0].method).toBe("GET");
      expect(requestLog[1].body).toContain("items%5B0%5D%5Bid%5D=si_1");
      expect(requestLog[1].body).toContain("items%5B0%5D%5Bprice%5D=price_test_pro");

      await prisma.plan.updateMany({ where: { key: PlanKey.PRO }, data: { stripePriceId: null } });
    });
  });

  describe("cancelSubscription", () => {
    it("annule réellement l'abonnement (DELETE)", async () => {
      process.env.STRIPE_SECRET_KEY = "sk_test_x";
      process.env.STRIPE_API_BASE_URL = baseUrl;
      responses["DELETE /subscriptions/sub_1"] = { id: "sub_1", status: "canceled" };

      const provider = new StripeBillingProvider();
      await provider.cancelSubscription({ subscriptionId: "sub_1" });

      expect(requestLog[0].method).toBe("DELETE");
      expect(requestLog[0].url).toBe("/subscriptions/sub_1");
    });
  });
});

describe("StripeBillingProvider — constructWebhookEvent", () => {
  it("accepte une signature valide et rejette une signature falsifiée", () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
    const provider = new StripeBillingProvider();
    const payload = JSON.stringify({ id: "evt_1", type: "invoice.payment_failed", data: { object: { customer: "cus_1" } } });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto.createHmac("sha256", "whsec_test_secret").update(`${timestamp}.${payload}`).digest("hex");

    const event = provider.constructWebhookEvent(payload, `t=${timestamp},v1=${signature}`);
    expect(event.id).toBe("evt_1");
    expect(event.type).toBe("invoice.payment_failed");
    expect((event.data as { customer: string }).customer).toBe("cus_1");

    expect(() => provider.constructWebhookEvent(payload, `t=${timestamp},v1=falsifiee`)).toThrow(ValidationError);
  });

  it("rejette un horodatage trop ancien (hors tolérance)", () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
    const provider = new StripeBillingProvider();
    const payload = JSON.stringify({ id: "evt_2", type: "invoice.payment_failed", data: { object: {} } });
    const oldTimestamp = Math.floor(Date.now() / 1000) - 3600;
    const signature = crypto.createHmac("sha256", "whsec_test_secret").update(`${oldTimestamp}.${payload}`).digest("hex");

    expect(() => provider.constructWebhookEvent(payload, `t=${oldTimestamp},v1=${signature}`)).toThrow(ValidationError);
  });
});
