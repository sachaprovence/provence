import type { PlanKey } from "@/generated/prisma/enums";

/**
 * Abstraction de facturation SaaS Autorun (v1.0, AR-0063) — distincte de
 * `PaymentProvider` (paiement ponctuel client final, `MOD-12`, jamais
 * implémenté) : ici, c'est Autorun qui facture SES PROPRES clients
 * (organisations) par abonnement récurrent, pas un paiement encaissé pour
 * le compte d'une organisation.
 */
export interface BillingCustomer {
  customerId: string;
}

export interface CheckoutResult {
  /** URL de paiement à laquelle rediriger l'utilisateur (mode réel) — `null` si l'abonnement a été activé directement (mode démo, sans redirection). */
  checkoutUrl: string | null;
  /** Renseigné uniquement quand l'abonnement est déjà actif de façon synchrone (mode démo) — en mode réel, l'abonnement est créé plus tard via le webhook entrant, après le paiement. */
  subscriptionId?: string;
}

export interface BillingWebhookEvent {
  /** Identifiant de l'évènement chez le fournisseur — utilisé pour l'idempotence (voir `WebhookEvent.externalId`). */
  id: string;
  type: string;
  data: Record<string, unknown>;
}

export interface BillingProvider {
  readonly name: string;

  createCustomer(params: { organizationId: string; email: string; name: string }): Promise<BillingCustomer>;

  /** Démarre un abonnement pour le plan demandé — voir `CheckoutResult` pour la différence de comportement synchrone/asynchrone selon le fournisseur. */
  startCheckout(params: {
    organizationId: string;
    customerId: string;
    planKey: PlanKey;
    successUrl: string;
    cancelUrl: string;
  }): Promise<CheckoutResult>;

  changePlan(params: { subscriptionId: string; newPlanKey: PlanKey }): Promise<void>;

  cancelSubscription(params: { subscriptionId: string }): Promise<void>;

  /** Vérifie la signature du webhook entrant et retourne l'évènement — lève une erreur explicite si la signature est invalide. */
  constructWebhookEvent(rawBody: string, signatureHeader: string | null): BillingWebhookEvent;
}
