"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast-provider";

type StepRow = {
  id: string;
  nodeId: string;
  nodeType: string;
  actionKey: string | null;
  status: string;
  attempt: number;
  output: unknown;
  error: unknown;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
};
type LogRow = { id: string; nodeId: string | null; level: string; message: string; metadata: unknown; createdAt: string };

const STATUS_VARIANT: Record<string, "neutral" | "success" | "warning" | "danger" | "info"> = {
  PENDING: "neutral",
  RUNNING: "info",
  WAITING: "warning",
  SUCCEEDED: "success",
  FAILED: "danger",
  SKIPPED: "warning",
  CANCELLED: "warning",
  COMPENSATED: "info",
  QUEUED: "neutral",
  TIMED_OUT: "danger",
};

const LOG_LEVEL_COLOR: Record<string, string> = {
  debug: "text-p360-muted",
  info: "text-p360-ink",
  warn: "text-p360-warning",
  error: "text-p360-danger",
};

export function WorkflowRunDetailClient({
  runId,
  workflowDefinitionId,
  workflowName,
  status,
  trigger,
  input,
  output,
  error,
  escalatedToDirector,
  steps,
  logs,
}: {
  runId: string;
  workflowDefinitionId: string;
  workflowName: string;
  status: string;
  trigger: string;
  input: unknown;
  output: unknown;
  error: unknown;
  escalatedToDirector: boolean;
  steps: StepRow[];
  logs: LogRow[];
}) {
  const router = useRouter();
  const { push } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function cancel() {
    setBusy("cancel");
    try {
      await apiPost(`/api/workflows/runs/${runId}/cancel`);
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
      const result = await apiPost<{ run: { id: string } }>(`/api/workflows/runs/${runId}/retry`);
      push({ title: "Nouvelle exécution lancée", variant: "success" });
      router.push(`/workflows/runs/${result.run.id}`);
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
              Exécution — <Link href={`/workflows/${workflowDefinitionId}`} className="text-p360-blue underline">{workflowName}</Link>
            </CardTitle>
            <p className="mt-1 text-xs text-p360-muted">
              Déclencheur : {trigger} {escalatedToDirector && <Badge variant="warning">Escaladé au Director</Badge>}
            </p>
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
          <CardTitle>Chronologie des étapes</CardTitle>
        </CardHeader>
        <ol className="space-y-2">
          {steps.map((step) => (
            <li key={step.id} className="rounded-md border border-p360-lavender-light p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium text-p360-ink">{step.nodeId}</span>
                  <span className="ml-2 text-xs text-p360-muted">
                    {step.nodeType}
                    {step.actionKey ? ` · ${step.actionKey}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-p360-muted">
                  {step.durationMs !== null && <span>{step.durationMs} ms</span>}
                  {step.attempt > 0 && <span>tentative {step.attempt + 1}</span>}
                  <Badge variant={STATUS_VARIANT[step.status] ?? "neutral"}>{step.status}</Badge>
                </div>
              </div>
              {(step.output !== null || step.error !== null) && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-p360-blue">Détails</summary>
                  {step.output !== null && <pre className="mt-1 overflow-auto rounded bg-p360-sand-light/50 p-2">{JSON.stringify(step.output, null, 2)}</pre>}
                  {step.error !== null && <pre className="mt-1 overflow-auto rounded bg-red-50 p-2 text-p360-danger">{JSON.stringify(step.error, null, 2)}</pre>}
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
