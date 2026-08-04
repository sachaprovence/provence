"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";

type DiagnosticStatus = "NOT_CONFIGURED" | "PARTIALLY_CONFIGURED" | "CONFIGURED" | "TEST_SUCCESS" | "TEST_FAILED" | "UNAVAILABLE";

interface DiagnosticSummary {
  key: string;
  label: string;
  status: DiagnosticStatus;
  statusLabel: string;
  message: string | null;
  testable: boolean;
  lastCheckedAt: string | null;
  lastCheckedBy: { id: string; firstName: string; lastName: string } | null;
}

const STATUS_BADGE_CLASS: Record<DiagnosticStatus, string> = {
  NOT_CONFIGURED: "badge bg-p360-sand-light text-p360-muted",
  PARTIALLY_CONFIGURED: "badge bg-p360-sand-light text-p360-warning",
  CONFIGURED: "badge bg-p360-lavender-light text-p360-ink",
  TEST_SUCCESS: "badge bg-green-100 text-p360-success",
  TEST_FAILED: "badge bg-red-100 text-p360-danger",
  UNAVAILABLE: "badge bg-red-100 text-p360-danger",
};

/**
 * Écran de diagnostic des intégrations (v1.2, AR-0165) — état de
 * Stripe/Twilio/Gmail/Outlook/S3, réservé à l'administrateur. N'affiche
 * JAMAIS aucun secret : ni ici, ni dans la réponse API sous-jacente (voir
 * `src/lib/diagnostics/`) — seulement un état et un message textuel
 * générés côté serveur.
 */
export function IntegrationDiagnosticsPanel() {
  const [diagnostics, setDiagnostics] = useState<DiagnosticSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ diagnostics: DiagnosticSummary[] }>("/api/settings/integrations/diagnostics")
      .then((res) => setDiagnostics(res.diagnostics))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erreur de chargement."))
      .finally(() => setLoading(false));
  }, []);

  async function handleTest(key: string) {
    setTestingKey(key);
    setError(null);
    try {
      const res = await apiPost<{ diagnostic: DiagnosticSummary }>("/api/settings/integrations/diagnostics/test", { integration: key });
      setDiagnostics((prev) => prev.map((d) => (d.key === key ? res.diagnostic : d)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Échec du test de connexion.");
    } finally {
      setTestingKey(null);
    }
  }

  if (loading) return <p className="text-sm text-p360-muted">Chargement…</p>;

  return (
    <div className="space-y-3">
      {error && <div className="card p-3 text-sm text-p360-danger border-p360-danger">{error}</div>}
      <ul className="divide-y divide-p360-lavender-light text-sm">
        {diagnostics.map((d) => (
          <li key={d.key} className="py-3 flex items-start justify-between gap-4">
            <div>
              <p className="text-p360-ink font-medium">{d.label}</p>
              {d.message && <p className="text-xs text-p360-muted mt-0.5">{d.message}</p>}
              {d.lastCheckedAt && (
                <p className="text-xs text-p360-muted mt-0.5">
                  Dernier test : {new Date(d.lastCheckedAt).toLocaleString("fr-FR")}
                  {d.lastCheckedBy ? ` par ${d.lastCheckedBy.firstName} ${d.lastCheckedBy.lastName}` : ""}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={STATUS_BADGE_CLASS[d.status]}>{d.statusLabel}</span>
              {d.testable && (
                <button type="button" className="btn-secondary text-xs" disabled={testingKey === d.key} onClick={() => handleTest(d.key)}>
                  {testingKey === d.key ? "Test en cours…" : "Tester la connexion"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-p360-muted">
        Aucune valeur de secret n&apos;est jamais affichée ici. Les tests de connexion sont limités en fréquence et journalisés (organisation, intégration, résultat — jamais les identifiants).
      </p>
    </div>
  );
}
