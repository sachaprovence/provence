"use client";

import { useEffect, useState } from "react";
import { StatTile } from "@/components/stat-tile";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type ObservabilityMetrics = {
  ai: { totalCostUsd: number; requestCount: number };
  email: { sent: number; failed: number; failureRate: number };
  apiLatency: {
    requestCount: number;
    avgDurationMs: number;
    errorCount: number;
    errorRate: number | null;
    byRoute: Record<string, { count: number; avgDurationMs: number }>;
  };
  queue: { dueNow: number; counts: { failed: number }; failureRate: number | null };
  workers: { active: number; poolSize: number };
};

type RecentError = { id: string; route: string; method: string; statusCode: number; durationMs: number; createdAt: string };

function formatUsd(value: number): string {
  return `$${value.toFixed(4)}`;
}
function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
function formatMs(value: number): string {
  return `${Math.round(value)} ms`;
}

const POLL_INTERVAL_MS = 30_000;

export function MetricsClient({
  initialMetrics,
  initialRecentErrors,
}: {
  initialMetrics: ObservabilityMetrics;
  initialRecentErrors: RecentError[];
}) {
  const [metrics, setMetrics] = useState(initialMetrics);
  const [recentErrors, setRecentErrors] = useState(initialRecentErrors);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const res = await fetch("/api/settings/metrics");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setMetrics(data.metrics);
        setRecentErrors(data.recentErrors ?? []);
        setLastRefreshed(new Date());
      } catch {
        // best-effort : on garde les dernières données affichées
      }
    }
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="space-y-8">
      <p className="text-xs text-p360-muted">
        Rafraîchi automatiquement toutes les 30 secondes{lastRefreshed ? ` — dernière mise à jour ${lastRefreshed.toLocaleTimeString("fr-FR")}` : ""}.
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
          <CardTitle>Erreurs récentes (5xx)</CardTitle>
        </CardHeader>
        <div className="p-6 pt-0">
          {recentErrors.length === 0 ? (
            <p className="text-sm text-p360-muted">Aucune erreur récente sur les routes instrumentées.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-p360-muted">
                  <th className="pb-2">Quand</th>
                  <th className="pb-2">Méthode</th>
                  <th className="pb-2">Route</th>
                  <th className="pb-2">Statut</th>
                  <th className="pb-2">Durée</th>
                </tr>
              </thead>
              <tbody>
                {recentErrors.map((e) => (
                  <tr key={e.id} className="border-t border-p360-lavender-light">
                    <td className="py-2 text-p360-muted">{new Date(e.createdAt).toLocaleString("fr-FR")}</td>
                    <td className="py-2">{e.method}</td>
                    <td className="py-2 text-p360-ink">{e.route}</td>
                    <td className="py-2">
                      <Badge variant="danger">{e.statusCode}</Badge>
                    </td>
                    <td className="py-2">{formatMs(e.durationMs)}</td>
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
