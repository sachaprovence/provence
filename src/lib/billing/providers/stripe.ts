import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { PlanKey } from "@/generated/prisma/enums";
import type { BillingProvider, BillingCustomer, CheckoutResult, BillingWebhookEvent } from "../types";

/**
 * Fournisseur Stripe Billing réel (v1.0, AR-0063) — appels `fetch()`
 * directs contre l'API REST Stripe documentée publiquement, même
 * convention que tous les autres fournisseurs réels du projet (Sentry,
 * Gmail, Outlook, Google Calendar, ADR 0038/0040) : pas de SDK `stripe`
 * officiel, pour éviter une dépendance supplémentaire alors qu'un simple
 * appel HTTP form-encodé suffit.
 */
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

function apiBaseUrl(): string {
  return process.env.STRIPE_API_BASE_URL || "https://api.stripe.com/v1";
}

function requireSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new ValidationError("Facturation Stripe non configurée au niveau du déploiement : variable d'environnement STRIPE_SECRET_KEY requise.");
  }
  return key;
}

function requireWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new ValidationError("Facturation Stripe non configurée : variable d'environnement STRIPE_WEBHOOK_SECRET requise.");
  }
  return secret;
}

/** Encodage `application/x-www-form-urlencoded` avec notation à crochets pour les objets imbriqués — format attendu par l'API Stripe. */
function toFormBody(data: Record<string, unknown>, prefix = ""): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    const fullKey = prefix ? `${prefix}[${key}]` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      parts.push(toFormBody(value as Record<string, unknown>, fullKey));
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (item && typeof item === "object") {
          parts.push(toFormBody(item as Record<string, unknown>, `${fullKey}[${index}]`));
        } else {
          parts.push(`${encodeURIComponent(`${fullKey}[${index}]`)}=${encodeURIComponent(String(item))}`);
        }
      });
    } else {
      parts.push(`${encodeURIComponent(fullKey)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.filter(Boolean).join("&");
}

async function stripeRequest(method: string, path: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${requireSecretKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body ? toFormBody(body) : undefined,
  });

  const responseBody = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message = (responseBody.error as { message?: string } | undefined)?.message ?? `Stripe a répondu ${response.status}.`;
    throw new Error(`Erreur Stripe : ${message}`);
  }
  return responseBody;
}

async function requirePlanStripePriceId(planKey: PlanKey): Promise<string> {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { key: planKey } });
  if (!plan.stripePriceId) {
    throw new ValidationError(`Le plan "${plan.name}" n'a pas de Price Stripe configuré (Plan.stripePriceId).`);
  }
  return plan.stripePriceId;
}

export class StripeBillingProvider implements BillingProvider {
  readonly name = "stripe";

  async createCustomer(params: { organizationId: string; email: string; name: string }): Promise<BillingCustomer> {
    const customer = await stripeRequest("POST", "/customers", {
      email: params.email,
      name: params.name,
      metadata: { organizationId: params.organizationId },
    });
    return { customerId: customer.id as string };
  }

  async startCheckout(params: {
    organizationId: string;
    customerId: string;
    planKey: PlanKey;
    successUrl: string;
    cancelUrl: string;
  }): Promise<CheckoutResult> {
    const priceId = await requirePlanStripePriceId(params.planKey);
    const session = await stripeRequest("POST", "/checkout/sessions", {
      mode: "subscription",
      customer: params.customerId,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { organizationId: params.organizationId, planKey: params.planKey },
      subscription_data: { metadata: { organizationId: params.organizationId, planKey: params.planKey } },
    });
    return { checkoutUrl: session.url as string };
  }

  async changePlan(params: { subscriptionId: string; newPlanKey: PlanKey }): Promise<void> {
    const newPriceId = await requirePlanStripePriceId(params.newPlanKey);
    const subscription = await stripeRequest("GET", `/subscriptions/${params.subscriptionId}`);
    const items = (subscription.items as { data: { id: string }[] } | undefined)?.data ?? [];
    const currentItemId = items[0]?.id;
    if (!currentItemId) {
      throw new Error(`Abonnement Stripe "${params.subscriptionId}" introuvable ou sans ligne d'abonnement.`);
    }

    await stripeRequest("POST", `/subscriptions/${params.subscriptionId}`, {
      items: [{ id: currentItemId, price: newPriceId }],
      proration_behavior: "create_prorations",
    });
  }

  async cancelSubscription(params: { subscriptionId: string }): Promise<void> {
    await stripeRequest("DELETE", `/subscriptions/${params.subscriptionId}`);
  }

  constructWebhookEvent(rawBody: string, signatureHeader: string | null): BillingWebhookEvent {
    if (!signatureHeader) {
      throw new ValidationError("Signature Stripe manquante (en-tête Stripe-Signature).");
    }

    const parts = Object.fromEntries(
      signatureHeader.split(",").map((part) => {
        const [key, value] = part.split("=");
        return [key, value];
      })
    );
    const timestamp = parts.t;
    const signature = parts.v1;
    if (!timestamp || !signature) {
      throw new ValidationError("Signature Stripe malformée.");
    }

    const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (ageSeconds > SIGNATURE_TOLERANCE_SECONDS) {
      throw new ValidationError("Webhook Stripe expiré (horodatage hors tolérance).");
    }

    const expectedSignature = crypto.createHmac("sha256", requireWebhookSecret()).update(`${timestamp}.${rawBody}`).digest("hex");
    const a = Buffer.from(signature);
    const b = Buffer.from(expectedSignature);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new ValidationError("Signature Stripe invalide.");
    }

    const event = JSON.parse(rawBody) as { id: string; type: string; data: { object: Record<string, unknown> } };
    return { id: event.id, type: event.type, data: event.data.object };
  }
}
