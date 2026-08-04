import { requireActor } from "@/lib/auth";
import { canManageOrganization } from "@/lib/permissions";
import { getOrganizationBillingSummary } from "@/lib/billing/subscription-service";
import { listPlans } from "@/lib/billing/plan-service";
import { BillingClient } from "./billing-client";

/** Gestion de l'abonnement (v1.0, AR-0065) — plan, statut, consommation de quota, changement/annulation. */
export default async function BillingPage() {
  const actor = await requireActor();

  if (!canManageOrganization(actor)) {
    return (
      <div className="max-w-3xl">
        <p className="text-sm text-p360-danger">Vous n&apos;avez pas la permission de gérer la facturation.</p>
      </div>
    );
  }

  const [summary, plans] = await Promise.all([
    getOrganizationBillingSummary(actor.organization.id),
    listPlans(),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-p360-ink">Facturation</h1>
        <p className="text-sm text-p360-muted mt-1">
          Plan, consommation de quota et cycle de vie de votre abonnement.
        </p>
      </div>
      <BillingClient
        initialSummary={JSON.parse(JSON.stringify(summary))}
        plans={plans.map((plan) => ({
          key: plan.key,
          name: plan.name,
          maxUsers: plan.maxUsers,
          dailySendLimit: plan.dailySendLimit,
          aiMonthlyBudgetUsd: plan.aiMonthlyBudgetUsd,
          priceMonthlyUsd: plan.priceMonthlyUsd,
        }))}
      />
    </div>
  );
}
