import { requireWorkspaceActor } from "@/lib/workspace-context";
import { hasWorkspacePermission } from "@/lib/workspace-permissions";
import { getObservabilityMetrics } from "@/lib/observability/metrics-service";
import { StatTile } from "@/components/stat-tile";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

function formatUsd(value: number): string {
  return `$${value.toFixed(4)}`;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatMs(value: number): string {
  return `${Math.round(value)} ms`;
}

/**
 * Métriques de base (brief v0.9 bis, AR-0049) — coût IA cumulé, taux
 * d'échec d'envoi email, latence API (routes instrumentées uniquement,
 * voir `src/lib/observability/api-metrics.ts`), sur les 30 derniers jours.
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

  const metrics = await getObservabilityMetrics(actor.organization.id);

  return (
    <div className="max-w-4xl space-y-8">
      <h1 className="text-2xl font-semibold text-p360-ink">Métriques</h1>
      <p className="text-sm text-p360-muted">
        Derniers 30 jours. La latence API ne couvre que les routes instrumentées
        (extension incrémentale, voir DEVELOPMENT_GUIDE.md).
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Coût IA cumulé</CardTitle>
        </CardHeader>
        <div className="p-6 pt-0 grid grid-cols-2 gap-4">
          <StatTile label="Coût total" value={formatUsd(metrics.ai.totalCostUsd)} />
          <StatTile label="Requêtes IA" value={String(metrics.ai.requestCount)} />
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Envois email</CardTitle>
        </CardHeader>
        <div className="p-6 pt-0 grid grid-cols-3 gap-4">
          <StatTile label="Envoyés" value={String(metrics.email.sent)} />
          <StatTile label="Échoués/rejetés" value={String(metrics.email.failed)} />
          <StatTile label="Taux d'échec" value={formatPercent(metrics.email.failureRate)} />
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Latence API (routes instrumentées)</CardTitle>
        </CardHeader>
        <div className="p-6 pt-0 space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <StatTile label="Requêtes mesurées" value={String(metrics.apiLatency.requestCount)} />
            <StatTile label="Latence moyenne" value={formatMs(metrics.apiLatency.avgDurationMs)} />
            <StatTile label="Erreurs (5xx)" value={String(metrics.apiLatency.errorCount)} />
            <StatTile label="Taux d'erreur" value={metrics.apiLatency.errorRate === null ? "—" : formatPercent(metrics.apiLatency.errorRate)} />
          </div>
          {Object.keys(metrics.apiLatency.byRoute).length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-p360-muted">
                  <th className="pb-2">Route</th>
                  <th className="pb-2">Requêtes</th>
                  <th className="pb-2">Latence moyenne</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(metrics.apiLatency.byRoute).map(([route, stats]) => (
                  <tr key={route} className="border-t border-p360-lavender-light">
                    <td className="py-2 text-p360-ink">{route}</td>
                    <td className="py-2">{stats.count}</td>
                    <td className="py-2">{formatMs(stats.avgDurationMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>File d&apos;attente et workers (Automation Engine)</CardTitle>
        </CardHeader>
        <div className="p-6 pt-0 grid grid-cols-2 gap-4">
          <StatTile label="En attente maintenant" value={String(metrics.queue.dueNow)} />
          <StatTile label="Workers actifs" value={`${metrics.workers.active} / ${metrics.workers.poolSize}`} />
          <StatTile label="Jobs en échec" value={String(metrics.queue.counts.failed)} />
          <StatTile
            label="Taux d'échec des jobs"
            value={metrics.queue.failureRate === null ? "—" : formatPercent(metrics.queue.failureRate)}
          />
        </div>
      </Card>
    </div>
  );
}
