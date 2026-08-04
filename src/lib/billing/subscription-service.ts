import "server-only";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { PlanKey, SubscriptionStatus } from "@/generated/prisma/enums";
import { getBillingProvider } from "./index";
import { applyPlanToOrganization, getPlanByKey, countOrganizationMembers } from "./plan-service";
import { getAiSpendThisMonthUsd } from "@/lib/ai/quota";
import { getEmailSentTodayCount } from "@/lib/email/quota";
import { logger } from "@/lib/logger";

/**
 * Cycle de vie de l'abonnement d'une organisation (v1.0, AR-0063) —
 * orchestre le fournisseur de facturation actif (`getBillingProvider()`)
 * ET la source de vérité locale des quotas (`Organization`, via
 * `plan-service.ts`) : le fournisseur gère le paiement récurrent, jamais
 * les quotas eux-mêmes (toujours appliqués localement, voir
 * `applyPlanToOrganization`).
 */
export interface CheckoutOutcome {
  checkoutUrl: string | null;
  activated: boolean;
}

export async function startOrganizationCheckout(params: {
  organizationId: string;
  planKey: PlanKey;
  requesterEmail: string;
  requesterName: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<CheckoutOutcome> {
  await getPlanByKey(params.planKey);
  const provider = getBillingProvider();
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: params.organizationId } });

  let customerId = organization.billingCustomerId;
  if (!customerId) {
    const customer = await provider.createCustomer({ organizationId: params.organizationId, email: params.requesterEmail, name: params.requesterName });
    customerId = customer.customerId;
    await prisma.organization.update({ where: { id: params.organizationId }, data: { billingCustomerId: customerId, billingProvider: provider.name } });
  }

  const result = await provider.startCheckout({
    organizationId: params.organizationId,
    customerId,
    planKey: params.planKey,
    successUrl: params.successUrl,
    cancelUrl: params.cancelUrl,
  });

  if (result.subscriptionId) {
    // Fournisseur synchrone (démo) : l'abonnement est déjà actif, pas de redirection.
    await prisma.organization.update({
      where: { id: params.organizationId },
      data: { billingSubscriptionId: result.subscriptionId, billingProvider: provider.name, subscriptionStatus: SubscriptionStatus.ACTIVE, subscriptionCanceledAt: null },
    });
    await applyPlanToOrganization(params.organizationId, params.planKey);
    return { checkoutUrl: null, activated: true };
  }

  return { checkoutUrl: result.checkoutUrl, activated: false };
}

export async function changeOrganizationPlan(organizationId: string, newPlanKey: PlanKey): Promise<void> {
  await getPlanByKey(newPlanKey);
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  if (!organization.billingSubscriptionId) {
    throw new ValidationError("Aucun abonnement actif pour cette organisation — souscrivez d'abord à un plan.");
  }

  const provider = getBillingProvider();
  await provider.changePlan({ subscriptionId: organization.billingSubscriptionId, newPlanKey });
  await applyPlanToOrganization(organizationId, newPlanKey);
}

export async function cancelOrganizationSubscription(organizationId: string): Promise<void> {
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  if (!organization.billingSubscriptionId) {
    throw new ValidationError("Aucun abonnement actif à annuler pour cette organisation.");
  }

  const provider = getBillingProvider();
  await provider.cancelSubscription({ subscriptionId: organization.billingSubscriptionId });
  await prisma.organization.update({
    where: { id: organizationId },
    data: { subscriptionStatus: SubscriptionStatus.CANCELED, subscriptionCanceledAt: new Date() },
  });
}

/** Résumé exposé à l'UI de facturation (AR-0065) — plan, statut, et consommation de quota en temps réel. */
export async function getOrganizationBillingSummary(organizationId: string) {
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, include: { plan: true } });
  const [memberCount, aiSpendThisMonthUsd, emailSentToday] = await Promise.all([
    countOrganizationMembers(organizationId),
    getAiSpendThisMonthUsd(organizationId),
    getEmailSentTodayCount(organizationId),
  ]);

  return {
    plan: organization.plan,
    billingProvider: organization.billingProvider,
    subscriptionStatus: organization.subscriptionStatus,
    subscriptionCanceledAt: organization.subscriptionCanceledAt,
    hasActiveSubscription: Boolean(organization.billingSubscriptionId),
    usage: {
      memberCount,
      maxUsers: organization.plan?.maxUsers ?? null,
      aiSpendThisMonthUsd,
      aiMonthlyBudgetUsd: organization.aiMonthlyBudgetUsd,
      emailSentToday,
      dailySendLimit: organization.dailySendLimit,
    },
  };
}

function mapStripeStatusToSubscriptionStatus(stripeStatus: string): SubscriptionStatus {
  switch (stripeStatus) {
    case "trialing":
      return SubscriptionStatus.TRIALING;
    case "active":
      return SubscriptionStatus.ACTIVE;
    case "past_due":
    case "unpaid":
      return SubscriptionStatus.PAST_DUE;
    case "canceled":
    case "incomplete_expired":
      return SubscriptionStatus.CANCELED;
    default:
      return SubscriptionStatus.RESTRICTED;
  }
}

/**
 * Traite un webhook entrant du fournisseur de facturation (mode réel
 * uniquement — le fournisseur démo ne reçoit jamais de webhook). Idempotent
 * via `WebhookEvent.externalId` (réutilise le modèle déjà existant, comblé
 * pour la première fois par v1.0 — voir migration `add_v1_saas_...`).
 */
export async function handleBillingWebhookEvent(rawBody: string, signatureHeader: string | null): Promise<{ processed: boolean }> {
  const provider = getBillingProvider();
  const event = provider.constructWebhookEvent(rawBody, signatureHeader);

  const alreadyProcessed = await prisma.webhookEvent.findUnique({ where: { source_externalId: { source: provider.name, externalId: event.id } } });
  if (alreadyProcessed) {
    return { processed: false };
  }
  await prisma.webhookEvent.create({
    data: { source: provider.name, externalId: event.id, eventType: event.type, payload: event.data as never, signatureValid: true, processedAt: new Date() },
  });

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data as { customer: string; subscription: string; metadata?: { organizationId?: string; planKey?: string } };
      const organizationId = session.metadata?.organizationId;
      const planKey = session.metadata?.planKey as PlanKey | undefined;
      if (!organizationId || !planKey) break;

      await prisma.organization.update({
        where: { id: organizationId },
        data: { billingSubscriptionId: session.subscription, subscriptionStatus: SubscriptionStatus.ACTIVE, subscriptionCanceledAt: null },
      });
      await applyPlanToOrganization(organizationId, planKey);
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data as { id: string; status: string; customer: string };
      const organization = await prisma.organization.findFirst({ where: { billingSubscriptionId: subscription.id } });
      if (!organization) break;
      await prisma.organization.update({
        where: { id: organization.id },
        data: { subscriptionStatus: mapStripeStatusToSubscriptionStatus(subscription.status) },
      });
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data as { id: string };
      const organization = await prisma.organization.findFirst({ where: { billingSubscriptionId: subscription.id } });
      if (!organization) break;
      await prisma.organization.update({
        where: { id: organization.id },
        data: { subscriptionStatus: SubscriptionStatus.CANCELED, subscriptionCanceledAt: new Date() },
      });
      break;
    }

    case "invoice.payment_failed": {
      // Bascule en statut restreint (écriture bloquée, lecture toujours possible) — jamais de perte de données, voir MILESTONES.md §v1.0.
      const invoice = event.data as { customer: string };
      const organization = await prisma.organization.findFirst({ where: { billingCustomerId: invoice.customer } });
      if (!organization) break;
      await prisma.organization.update({ where: { id: organization.id }, data: { subscriptionStatus: SubscriptionStatus.RESTRICTED } });
      logger.warn({ module: "billing", organizationId: organization.id }, "Échec de paiement d'abonnement — organisation bascule en statut RESTRICTED.");
      break;
    }

    default:
      break;
  }

  return { processed: true };
}
