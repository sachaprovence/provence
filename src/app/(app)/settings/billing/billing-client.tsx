"use client";

import { useState } from "react";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

interface BillingPlan {
  key: string;
  name: string;
  maxUsers: number;
  dailySendLimit: number;
  aiMonthlyBudgetUsd: number | null;
  priceMonthlyUsd: number;
}

interface BillingSummary {
  plan: BillingPlan | null;
  billingProvider: string;
  subscriptionStatus: string;
  subscriptionCanceledAt: string | null;
  hasActiveSubscription: boolean;
  usage: {
    memberCount: number;
    maxUsers: number | null;
    aiSpendThisMonthUsd: number;
    aiMonthlyBudgetUsd: number | null;
    emailSentToday: number;
    dailySendLimit: number;
  };
}

function redirectToCheckout(url: string) {
  window.location.href = url;
}

const STATUS_LABELS: Record<string, string> = {
  TRIALING: "Essai",
  ACTIVE: "Actif",
  PAST_DUE: "Paiement en retard",
  CANCELED: "Annulé",
  RESTRICTED: "Restreint (échec de paiement)",
};

function formatUsd(cents: number): string {
  return `${(cents / 100).toFixed(0)} $`;
}

export function BillingClient({ initialSummary, plans }: { initialSummary: BillingSummary; plans: BillingPlan[] }) {
  const [summary, setSummary] = useState<BillingSummary>(initialSummary);
  const [busyPlanKey, setBusyPlanKey] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const { summary: latest } = await apiGet<{ summary: BillingSummary }>("/api/settings/billing");
    setSummary(latest);
  }

  async function choosePlan(planKey: string) {
    setBusyPlanKey(planKey);
    setError(null);
    try {
      if (!summary.hasActiveSubscription) {
        const outcome = await apiPost<{ checkoutUrl: string | null }>("/api/billing/checkout", { planKey });
        if (outcome.checkoutUrl) {
          redirectToCheckout(outcome.checkoutUrl);
          return;
        }
      } else {
        await apiPost("/api/billing/change-plan", { planKey });
      }
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur inattendue.");
    } finally {
      setBusyPlanKey(null);
    }
  }

  async function cancel() {
    setCanceling(true);
    setError(null);
    try {
      await apiPost("/api/billing/cancel");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur inattendue.");
    } finally {
      setCanceling(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Abonnement actuel</CardTitle>
        </CardHeader>
        <div className="text-sm space-y-1">
          <p>
            Plan : <span className="font-medium">{summary.plan?.name ?? "Aucun"}</span>
          </p>
          <p>
            Statut : <span className="font-medium">{STATUS_LABELS[summary.subscriptionStatus] ?? summary.subscriptionStatus}</span>
          </p>
          {summary.subscriptionStatus === "RESTRICTED" && (
            <p className="text-p360-danger">
              Le dernier paiement a échoué — les actions d&apos;écriture sont bloquées jusqu&apos;à régularisation.
            </p>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Consommation</CardTitle>
        </CardHeader>
        <div className="text-sm space-y-1">
          <p>
            Membres : {summary.usage.memberCount} / {summary.usage.maxUsers ?? "illimité"}
          </p>
          <p>
            Emails envoyés aujourd&apos;hui : {summary.usage.emailSentToday} / {summary.usage.dailySendLimit}
          </p>
          <p>
            Dépense IA ce mois-ci : {summary.usage.aiSpendThisMonthUsd.toFixed(2)} $ /{" "}
            {summary.usage.aiMonthlyBudgetUsd !== null ? `${summary.usage.aiMonthlyBudgetUsd} $` : "illimité"}
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plans disponibles</CardTitle>
        </CardHeader>
        <div className="space-y-2">
          {plans.map((plan) => {
            const isCurrent = summary.plan?.key === plan.key;
            return (
              <div
                key={plan.key}
                className={`flex items-center justify-between rounded border p-3 text-sm ${
                  isCurrent ? "border-p360-blue bg-p360-blue/5" : "border-p360-border"
                }`}
              >
                <div>
                  <div className="font-medium">{plan.name}</div>
                  <div className="text-p360-muted text-xs">
                    {formatUsd(plan.priceMonthlyUsd)} / mois · {plan.maxUsers} utilisateur(s) · {plan.dailySendLimit} emails/jour
                  </div>
                </div>
                {isCurrent ? (
                  <span className="text-xs text-p360-muted">Plan actuel</span>
                ) : (
                  <button className="btn-secondary text-xs" disabled={busyPlanKey === plan.key} onClick={() => choosePlan(plan.key)}>
                    {busyPlanKey === plan.key ? "…" : "Choisir"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {error && <p className="text-sm text-p360-danger mt-2">{error}</p>}
      </Card>

      {summary.hasActiveSubscription && summary.subscriptionStatus !== "CANCELED" && (
        <Card>
          <CardHeader>
            <CardTitle>Annuler l&apos;abonnement</CardTitle>
          </CardHeader>
          <button className="btn-secondary text-xs" disabled={canceling} onClick={cancel}>
            {canceling ? "Annulation…" : "Annuler l'abonnement"}
          </button>
        </Card>
      )}
    </div>
  );
}
