"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast-provider";

interface PublicPlan {
  id: string;
  key: string;
  name: string;
  maxUsers: number;
  dailySendLimit: number;
  aiMonthlyBudgetUsd: number | null;
  priceMonthlyUsd: number;
}

export default function RegisterPage() {
  const router = useRouter();
  const { push } = useToast();
  const [form, setForm] = useState({
    organizationName: "",
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    planKey: "STARTER",
  });
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    function load() {
      return apiGet<{ plans: PublicPlan[] }>("/api/plans").then(({ plans }) => setPlans(plans));
    }
    load().catch(() => {});
  }, []);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { checkoutUrl } = await apiPost<{ checkoutUrl: string | null }>("/api/auth/register", form);
      if (checkoutUrl) {
        // Mode Stripe réel : le paiement se termine chez le fournisseur, pas dans l'application.
        window.location.href = checkoutUrl;
        return;
      }
      router.push("/onboarding");
      router.refresh();
    } catch (err) {
      push({
        title: "Création du compte impossible",
        description: err instanceof ApiError ? err.message : "Erreur lors de la création du compte.",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="text-lg font-semibold mb-6 text-p360-ink">Créer votre organisation</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="organizationName"
          label="Nom de l'entreprise"
          required
          value={form.organizationName}
          onChange={(e) => update("organizationName", e.target.value)}
          placeholder="Provence 360"
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            id="firstName"
            label="Prénom"
            required
            value={form.firstName}
            onChange={(e) => update("firstName", e.target.value)}
          />
          <Input
            id="lastName"
            label="Nom"
            required
            value={form.lastName}
            onChange={(e) => update("lastName", e.target.value)}
          />
        </div>
        <Input
          id="email"
          type="email"
          label="Email"
          required
          value={form.email}
          onChange={(e) => update("email", e.target.value)}
          autoComplete="email"
        />
        <Input
          id="password"
          type="password"
          label="Mot de passe"
          required
          minLength={8}
          value={form.password}
          onChange={(e) => update("password", e.target.value)}
          autoComplete="new-password"
          hint="8 caractères minimum."
        />
        {plans.length > 0 && (
          <div>
            <span className="block text-sm font-medium text-p360-ink mb-2">Plan</span>
            <div className="grid grid-cols-1 gap-2">
              {plans.map((plan) => (
                <label
                  key={plan.key}
                  className={`flex items-center justify-between rounded border p-3 cursor-pointer text-sm ${
                    form.planKey === plan.key ? "border-p360-blue bg-p360-blue/5" : "border-p360-border"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="planKey"
                      value={plan.key}
                      checked={form.planKey === plan.key}
                      onChange={() => update("planKey", plan.key)}
                    />
                    <span className="font-medium">{plan.name}</span>
                  </span>
                  <span className="text-p360-muted">
                    {(plan.priceMonthlyUsd / 100).toFixed(0)} $ / mois · {plan.maxUsers} utilisateur(s)
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
        <Button type="submit" loading={loading} className="w-full">
          Créer mon compte
        </Button>
      </form>
      <p className="mt-4 text-sm text-p360-muted">
        Déjà un compte ?{" "}
        <Link href="/login" className="text-p360-blue hover:underline">
          Se connecter
        </Link>
      </p>
    </>
  );
}
