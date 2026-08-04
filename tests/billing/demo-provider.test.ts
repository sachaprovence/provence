import { describe, expect, it } from "vitest";
import { DemoBillingProvider } from "@/lib/billing/demo-provider";
import { getBillingProvider } from "@/lib/billing";
import { PlanKey } from "@/generated/prisma/enums";

/** Fournisseur de facturation démo (v1.0, AR-0063) — active l'abonnement immédiatement, sans configuration externe. */
describe("DemoBillingProvider", () => {
  it("createCustomer renvoie un customerId synthétique unique", async () => {
    const provider = new DemoBillingProvider();
    const a = await provider.createCustomer({ organizationId: "org-1", email: "a@b.test", name: "Org" });
    const b = await provider.createCustomer({ organizationId: "org-1", email: "a@b.test", name: "Org" });
    expect(a.customerId).toMatch(/^demo-cust-/);
    expect(a.customerId).not.toBe(b.customerId);
  });

  it("startCheckout active l'abonnement immédiatement, sans URL de redirection", async () => {
    const provider = new DemoBillingProvider();
    const result = await provider.startCheckout({
      organizationId: "org-1",
      customerId: "demo-cust-1",
      planKey: PlanKey.STARTER,
      successUrl: "https://x/s",
      cancelUrl: "https://x/c",
    });
    expect(result.checkoutUrl).toBeNull();
    expect(result.subscriptionId).toMatch(/^demo-sub-/);
  });

  it("changePlan et cancelSubscription ne lèvent jamais d'exception (rien à synchroniser en démo)", async () => {
    const provider = new DemoBillingProvider();
    await expect(provider.changePlan({ subscriptionId: "demo-sub-1", newPlanKey: PlanKey.PRO })).resolves.toBeUndefined();
    await expect(provider.cancelSubscription({ subscriptionId: "demo-sub-1" })).resolves.toBeUndefined();
  });

  it("constructWebhookEvent échoue explicitement (aucun webhook entrant réel en mode démo)", () => {
    const provider = new DemoBillingProvider();
    expect(() => provider.constructWebhookEvent("{}", null)).toThrow();
  });
});

describe("getBillingProvider", () => {
  it("renvoie le fournisseur démo par défaut", () => {
    delete process.env.BILLING_PROVIDER;
    expect(getBillingProvider().name).toBe("demo");
  });

  it("renvoie le fournisseur Stripe quand BILLING_PROVIDER=stripe", () => {
    process.env.BILLING_PROVIDER = "stripe";
    expect(getBillingProvider().name).toBe("stripe");
    delete process.env.BILLING_PROVIDER;
  });
});
