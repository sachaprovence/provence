"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api-client";

const PLAN_OPTIONS = [
  { key: "TRIAL", label: "Essai" },
  { key: "STARTER", label: "Starter" },
  { key: "PRO", label: "Pro" },
  { key: "ENTERPRISE", label: "Entreprise" },
];

/** Actions administratives sur une organisation (v1.4, AR-0185) — changement de plan, suspension, réactivation. Toutes journalisées côté serveur (`admin-service.ts`). */
export function AdminOrganizationActions({ organizationId, currentPlanKey, isSuspended }: { organizationId: string; currentPlanKey: string | null; isSuspended: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planKey, setPlanKey] = useState(currentPlanKey ?? "TRIAL");

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4 space-y-3">
      <h2 className="text-sm font-semibold text-p360-ink">Actions administratives</h2>
      {error && <p className="text-sm text-p360-danger">{error}</p>}
      <div className="flex items-center gap-2">
        <select className="input text-sm" value={planKey} onChange={(e) => setPlanKey(e.target.value)} disabled={busy}>
          {PLAN_OPTIONS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn-secondary text-sm"
          disabled={busy}
          onClick={() => run(() => apiPost(`/api/admin/organizations/${organizationId}/plan`, { planKey }))}
        >
          Changer le plan
        </button>
      </div>
      <div>
        {isSuspended ? (
          <button
            type="button"
            className="btn-secondary text-sm"
            disabled={busy}
            onClick={() => run(() => apiPost(`/api/admin/organizations/${organizationId}/reactivate`))}
          >
            Réactiver l&apos;organisation
          </button>
        ) : (
          <button
            type="button"
            className="btn-danger text-sm"
            disabled={busy}
            onClick={() => {
              if (!confirm("Suspendre cette organisation ? Ses membres ne pourront plus écrire de données (lecture toujours possible).")) return;
              run(() => apiPost(`/api/admin/organizations/${organizationId}/suspend`));
            }}
          >
            Suspendre l&apos;organisation
          </button>
        )}
      </div>
    </div>
  );
}
