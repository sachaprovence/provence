"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast-provider";

type JobRow = {
  id: string;
  nodeId: string | null;
  jobType: string;
  status: string;
  attempt: number;
  maxAttempts: number;
  output: unknown;
  error: unknown;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
};
type LogRow = { id: string; nodeId: string | null; level: string; message: string; metadata: unknown; createdAt: string };

const STATUS_VARIANT: Record<string, "neutral" | "success" | "warning" | "danger" | "info"> = {
  PENDING: "neutral",
  QUEUED: "neutral",
  CLAIMED: "info",
  RUNNING: "info",
  WAITING: "warning",
  SUCCEEDED: "success",
  FAILED: "danger",
  SKIPPED: "warning",
  CANCELLED: "warning",
  TIMED_OUT: "danger",
  DEAD_LETTERED: "danger",
};

const LOG_LEVEL_COLOR: Record<string, string> = {
  debug: "text-p360-muted",
  info: "text-p360-ink",
  warn: "text-p360-warning",
  error: "text-p360-danger",
};

export function AutomationRunDetailClient({
  runId,
  automationId,
  automationName,
  status,
  trigger,
  input,
  output,
  error,
  jobs,
  logs,
}: {
  runId: string;
  automationId: string;
  automationName: string;
  status: string;
  trigger: string;
  input: unknown;
  output: unknown;
  error: unknown;
  jobs: JobRow[];
  logs: LogRow[];
}) {
  const router = useRouter();
  const { push } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function cancel() {
    setBusy("cancel");
    try {
      await apiPost(`/api/automations/runs/${runId}/cancel`);
      push({ title: "Exécution annulée", variant: "info" });
      router.refresh();
    } catch (e) {
      push({ title: "Échec de l'annulation", description: (e as Error).message, variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function retry() {
    setBusy("retry");
    try {
      const result = await apiPost<{ run: { id: string } }>(`/api/automations/runs/${runId}/retry`);
      push({ title: "Nouvelle exécution lancée", variant: "success" });
      router.push(`/automations/runs/${result.run.id}`);
    } catch (e) {
      push({ title: "Échec de la relance", description: (e as Error).message, variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  const canCancel = status === "QUEUED" || status === "RUNNING" || status === "WAITING";
  const canRetry = status === "FAILED" || status === "TIMED_OUT" || status === "CANCELLED";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>
              Exécution —{" "}
              <Link href={`/automations/${automationId}`} className="text-p360-blue underline">
                {automationName}
              </Link>
            </CardTitle>
            <p className="mt-1 text-xs text-p360-muted">Déclencheur : {trigger}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[status] ?? "neutral"}>{status}</Badge>
            {canCancel && (
              <Button variant="danger" loading={busy === "cancel"} onClick={cancel}>
                Annuler
              </Button>
            )}
            {canRetry && (
              <Button variant="secondary" loading={busy === "retry"} onClick={retry}>
                Relancer
              </Button>
            )}
          </div>
        </CardHeader>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <p className="text-xs font-semibold text-p360-muted">Entrée</p>
            <pre className="max-h-40 overflow-auto rounded bg-p360-sand-light/50 p-2 text-xs">{JSON.stringify(input, null, 2)}</pre>
          </div>
          <div>
            <p className="text-xs font-semibold text-p360-muted">Sortie</p>
            <pre className="max-h-40 overflow-auto rounded bg-p360-sand-light/50 p-2 text-xs">{JSON.stringify(output, null, 2)}</pre>
          </div>
          <div>
            <p className="text-xs font-semibold text-p360-muted">Erreur</p>
            <pre className="max-h-40 overflow-auto rounded bg-red-50 p-2 text-xs text-p360-danger">{JSON.stringify(error, null, 2)}</pre>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Jobs du noyau ({jobs.length})</CardTitle>
        </CardHeader>
        <ol className="space-y-2">
          {jobs.map((job) => (
            <li key={job.id} className="rounded-md border border-p360-lavender-light p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium text-p360-ink">{job.nodeId ?? job.id}</span>
                  <span className="ml-2 text-xs text-p360-muted">{job.jobType}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-p360-muted">
                  {job.durationMs !== null && <span>{job.durationMs} ms</span>}
                  {job.attempt > 0 && (
                    <span>
                      tentative {job.attempt} / {job.maxAttempts}
                    </span>
                  )}
                  <Badge variant={STATUS_VARIANT[job.status] ?? "neutral"}>{job.status}</Badge>
                </div>
              </div>
              {(job.output !== null || job.error !== null) && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-p360-blue">Détails</summary>
                  {job.output !== null && <pre className="mt-1 overflow-auto rounded bg-p360-sand-light/50 p-2">{JSON.stringify(job.output, null, 2)}</pre>}
                  {job.error !== null && <pre className="mt-1 overflow-auto rounded bg-red-50 p-2 text-p360-danger">{JSON.stringify(job.error, null, 2)}</pre>}
                </details>
              )}
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Journal</CardTitle>
        </CardHeader>
        <ul className="max-h-96 space-y-1 overflow-y-auto font-mono text-xs">
          {logs.map((log) => (
            <li key={log.id} className={LOG_LEVEL_COLOR[log.level] ?? "text-p360-ink"}>
              <span className="text-p360-muted">{new Date(log.createdAt).toLocaleTimeString("fr-FR")}</span>{" "}
              {log.nodeId && <span className="text-p360-muted">[{log.nodeId}]</span>} {log.message}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
