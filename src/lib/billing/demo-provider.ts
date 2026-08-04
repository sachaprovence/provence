import "server-only";
import crypto from "node:crypto";
import type { PlanKey } from "@/generated/prisma/enums";
import type { BillingProvider, BillingCustomer, CheckoutResult, BillingWebhookEvent } from "./types";

/**
 * Fournisseur de facturation par défaut — active l'abonnement immédiatement
 * et synchrone, sans aucune clé API ni service payant, pour que l'onboarding
 * self-service (AR-0064) fonctionne "out of the box" comme le reste du
 * projet (même principe que `DemoAIProvider`/`DemoEmailProvider`).
 */
export class DemoBillingProvider implements BillingProvider {
  readonly name = "demo";

  async createCustomer(_params: { organizationId: string; email: string; name: string }): Promise<BillingCustomer> {
    return { customerId: `demo-cust-${crypto.randomUUID()}` };
  }

  async startCheckout(_params: {
    organizationId: string;
    customerId: string;
    planKey: PlanKey;
    successUrl: string;
    cancelUrl: string;
  }): Promise<CheckoutResult> {
    return { checkoutUrl: null, subscriptionId: `demo-sub-${crypto.randomUUID()}` };
  }

  async changePlan(_params: { subscriptionId: string; newPlanKey: PlanKey }): Promise<void> {
    // Rien à synchroniser en mode démo — le plan appliqué à l'organisation (voir plan-service.ts) est la seule source de vérité.
  }

  async cancelSubscription(_params: { subscriptionId: string }): Promise<void> {
    // Idem — aucun abonnement externe réel à annuler.
  }

  constructWebhookEvent(_rawBody: string, _signatureHeader: string | null): BillingWebhookEvent {
    throw new Error("Le fournisseur de facturation démo ne reçoit jamais de webhook entrant (aucun service externe réel).");
  }
}
