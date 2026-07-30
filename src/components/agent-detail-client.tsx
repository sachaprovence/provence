"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPatch, apiPost, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/stat-tile";
import { useToast } from "@/components/ui/toast-provider";

type Stats = {
  totalRuns: number;
  successRate: number | null;
  averageDurationMs: number | null;
  aiRequestCount: number;
  estimatedAiCostUsd: number;
  lastRunAt: string | null;
  lastRunStatus: string | null;
};

type RunRow = {
  id: string;
  status: string;
  trigger: string;
  attempt: number;
  maxAttempts: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

type MemoryRow = { id: string; scope: string; key: string; value: unknown; updatedAt: string };
type MessageRow = { id: string; type: string; status: string; payload: unknown; createdAt: string };

const RUN_STATUS_VARIANT: Record<string, "neutral" | "success" | "warning" | "danger" | "info"> = {
  QUEUED: "neutral",
  RUNNING: "info",
  SUCCEEDED: "success",
  FAILED: "danger",
  CANCELLED: "warning",
  TIMED_OUT: "danger",
};

export function AgentDetailClient({
  installationId,
  status,
  grantedToolKeys,
  grantedPermissions,
  declaredToolKeys,
  declaredPermissions,
  stats,
  runs,
  memoryEntries,
  messages,
}: {
  installationId: string;
  status: string;
  grantedToolKeys: string[];
  grantedPermissions: string[];
  declaredToolKeys: string[];
  declaredPermissions: string[];
  stats: Stats;
  runs: RunRow[];
  memoryEntries: MemoryRow[];
  messages: MessageRow[];
}) {
  const router = useRouter();
  const { push } = useToast();
  const [triggering, setTriggering] = useState(false);
  const [savingGrants, setSavingGrants] = useState(false);
  const [tools, setTools] = useState(new Set(grantedToolKeys));
  const [permissions, setPermissions] = useState(new Set(grantedPermissions));
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [logsByRun, setLogsByRun] = useState<Record<string, { level: string; message: string; createdAt: string }[]>>({});

  async function handleTriggerRun() {
    setTriggering(true);
    try {
      await apiPost(`/api/agents/installations/${installationId}/runs`, {});
      router.refresh();
      push({ title: "Exécution déclenchée", variant: "success" });
    } catch (err) {
      push({
        title: "Exécution impossible",
        description: err instanceof ApiError ? err.message : "Erreur inattendue.",
        variant: "error",
      });
    } finally {
      setTriggering(false);
    }
  }

  async function handleSaveGrants() {
    setSavingGrants(true);
    try {
      await apiPatch(`/api/agents/installations/${installationId}`, {
        toolKeys: Array.from(tools),
        permissions: Array.from(permissions),
      });
      router.refresh();
      push({ title: "Permissions mises à jour", variant: "success" });
    } catch (err) {
      push({
        title: "Mise à jour impossible",
        description: err instanceof ApiError ? err.message : "Erreur inattendue.",
        variant: "error",
      });
    } finally {
      setSavingGrants(false);
    }
  }

  async function toggleRunLogs(runId: string) {
    if (expandedRunId === runId) {
      setExpandedRunId(null);
      return;
    }
    setExpandedRunId(runId);
    if (!logsByRun[runId]) {
      const { logs } = await apiGet<{ logs: { level: string; message: string; createdAt: string }[] }>(
        `/api/agents/runs/${runId}`
      );
      setLogsByRun((prev) => ({ ...prev, [runId]: logs }));
    }
  }

  function toggleInSet(set: Set<string>, value: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Badge variant={status === "ACTIVE" ? "success" : status === "SUSPENDED" ? "warning" : "neutral"}>{status}</Badge>
        <Button variant="primary" loading={triggering} disabled={status !== "ACTIVE"} onClick={handleTriggerRun}>
          Exécuter maintenant
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Exécutions totales" value={String(stats.totalRuns)} />
        <StatTile
          label="Taux de succès"
          value={stats.successRate !== null ? `${Math.round(stats.successRate * 100)}%` : "—"}
        />
        <StatTile
          label="Durée moyenne"
          value={stats.averageDurationMs !== null ? `${Math.round(stats.averageDurationMs)} ms` : "—"}
        />
        <StatTile label="Coût IA estimé" value={`${stats.estimatedAiCostUsd.toFixed(4)} $`} sub={`${stats.aiRequestCount} appel(s)`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Outils et permissions accordés</CardTitle>
        </CardHeader>
        <div className="space-y-3">
          <div>
            <p className="label">Outils</p>
            <div className="flex flex-wrap gap-2">
              {declaredToolKeys.map((key) => (
                <label key={key} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={tools.has(key)}
                    onChange={() => toggleInSet(tools, key, setTools)}
                  />
                  {key}
                </label>
              ))}
              {declaredToolKeys.length === 0 && <p className="text-sm text-p360-muted">Aucun outil déclaré.</p>}
            </div>
          </div>
          <div>
            <p className="label">Permissions</p>
            <div className="flex flex-wrap gap-2">
              {declaredPermissions.map((key) => (
                <label key={key} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={permissions.has(key)}
                    onChange={() => toggleInSet(permissions, key, setPermissions)}
                  />
                  {key}
                </label>
              ))}
              {declaredPermissions.length === 0 && <p className="text-sm text-p360-muted">Aucune permission déclarée.</p>}
            </div>
          </div>
          <Button variant="secondary" loading={savingGrants} onClick={handleSaveGrants}>
            Enregistrer
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Exécutions</CardTitle>
        </CardHeader>
        {runs.length === 0 ? (
          <EmptyState title="Aucune exécution" />
        ) : (
          <div className="divide-y divide-p360-lavender-light">
            {runs.map((run) => (
              <div key={run.id} className="py-2">
                <button
                  type="button"
                  onClick={() => toggleRunLogs(run.id)}
                  className="flex w-full items-center justify-between text-left text-sm"
                >
                  <span className="flex items-center gap-2">
                    <Badge variant={RUN_STATUS_VARIANT[run.status] ?? "neutral"}>{run.status}</Badge>
                    <span className="text-p360-muted">{run.trigger}</span>
                    <span className="text-p360-muted">
                      tentative {run.attempt}/{run.maxAttempts}
                    </span>
                  </span>
                  <span className="text-xs text-p360-muted">{new Date(run.createdAt).toLocaleString("fr-FR")}</span>
                </button>
                {expandedRunId === run.id && (
                  <div className="mt-2 rounded-lg bg-p360-lavender-light/30 p-3 text-xs">
                    {(logsByRun[run.id] ?? []).map((log, index) => (
                      <div key={index} className="font-mono">
                        <span className="text-p360-muted">[{log.level}]</span> {log.message}
                      </div>
                    ))}
                    {logsByRun[run.id]?.length === 0 && <p className="text-p360-muted">Aucun journal.</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mémoire</CardTitle>
        </CardHeader>
        {memoryEntries.length === 0 ? (
          <EmptyState title="Aucune entrée de mémoire" />
        ) : (
          <ul className="space-y-1 text-sm">
            {memoryEntries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between">
                <span>
                  <Badge variant="neutral">{entry.scope}</Badge> <span className="text-p360-ink">{entry.key}</span>
                </span>
                <span className="text-xs text-p360-muted">{new Date(entry.updatedAt).toLocaleString("fr-FR")}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Messages</CardTitle>
        </CardHeader>
        {messages.length === 0 ? (
          <EmptyState title="Aucun message" />
        ) : (
          <ul className="space-y-1 text-sm">
            {messages.map((message) => (
              <li key={message.id} className="flex items-center justify-between">
                <span>
                  <Badge variant="neutral">{message.type}</Badge> <span className="text-p360-muted">{message.status}</span>
                </span>
                <span className="text-xs text-p360-muted">{new Date(message.createdAt).toLocaleString("fr-FR")}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
