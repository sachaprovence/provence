import { requireWorkspaceActor } from "@/lib/workspace-context";
import { hasWorkspacePermission } from "@/lib/workspace-permissions";
import { getObservabilityMetrics, getRecentApiErrors } from "@/lib/observability/metrics-service";
import { MetricsClient } from "@/components/metrics-client";

/**
 * Métriques de base (brief v0.9 bis, AR-0049) — coût IA cumulé, taux
 * d'échec d'envoi email, latence API (routes instrumentées uniquement,
 * voir `src/lib/observability/api-metrics.ts`), sur les 30 derniers jours.
 * Rafraîchi automatiquement côté client toutes les 30s (v1.6, mission
 * "Observabilité") + journal des dernières erreurs 5xx.
 */
export default async function MetricsPage() {
  const actor = await requireWorkspaceActor();

  if (!hasWorkspacePermission(actor.workspace.role, "MANAGE_WORKSPACE")) {
    return (
      <div className="max-w-3xl">
        <p className="text-sm text-p360-danger">Vous n&apos;avez pas la permission de consulter les métriques.</p>
      </div>
    );
  }

  const [metrics, recentErrors] = await Promise.all([
    getObservabilityMetrics(actor.organization.id),
    getRecentApiErrors(actor.organization.id),
  ]);

  return (
    <div className="max-w-4xl space-y-8">
      <h1 className="text-2xl font-semibold text-p360-ink">Métriques</h1>
      <p className="text-sm text-p360-muted">
        Derniers 30 jours. La latence API ne couvre que les routes instrumentées
        (extension incrémentale, voir DEVELOPMENT_GUIDE.md).
      </p>

      <MetricsClient
        initialMetrics={metrics}
        initialRecentErrors={recentErrors.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() }))}
      />
    </div>
  );
}
