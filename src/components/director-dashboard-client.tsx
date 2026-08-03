"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/stat-tile";
import { useToast } from "@/components/ui/toast-provider";
import { DirectorPlanGraph, type PlanGraphNode, type PlanGraphEdge } from "@/components/director-plan-graph";

type ActiveAgent = { id: string; name: string; category: string; icon: string | null };
type PlanRow = { id: string; goal: string; status: string; createdAt: string; stepCount: number };
type ScheduleRow = { id: string; kind: string; nextRunAt: string | null; agentName: string };
type MessageRow = { id: string; type: string; status: string; createdAt: string };
type StepRow = {
  id: string;
  stepIndex: number;
  objective: string;
  status: string;
  targetLabel: string;
  result: unknown;
  error: unknown;
};

const PLAN_STATUS_VARIANT: Record<string, "neutral" | "success" | "warning" | "danger" | "info"> = {
  DRAFT: "neutral",
  RUNNING: "info",
  SUCCEEDED: "success",
  FAILED: "danger",
  CANCELLED: "warning",
};

const STEP_STATUS_VARIANT: Record<string, "neutral" | "success" | "warning" | "danger" | "info"> = {
  PENDING: "neutral",
  READY: "neutral",
  DELEGATED: "info",
  RUNNING: "info",
  SUCCEEDED: "success",
  FAILED: "danger",
  SKIPPED: "warning",
  CANCELLED: "warning",
};

export function DirectorDashboardClient({
  directorInstalled,
  directorStatus,
  activeAgents,
  tasks,
  queuedRuns,
  activeSchedules,
  recentPlans,
  recentMessages,
  consumption,
}: {
  directorInstalled: boolean;
  directorStatus: string | null;
  activeAgents: ActiveAgent[];
  tasks: { pending: number; completed: number; failed: number; skipped: number; cancelled: number };
  queuedRuns: number;
  activeSchedules: ScheduleRow[];
  recentPlans: PlanRow[];
  recentMessages: MessageRow[];
  consumption: { totalRuns: number; averageDurationMs: number | null; aiRequestCount: number; estimatedAiCostUsd: number };
}) {
  const router = useRouter();
  const { push } = useToast();
  const [objective, setObjective] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [graph, setGraph] = useState<{ nodes: PlanGraphNode[]; edges: PlanGraphEdge[]; steps: StepRow[] } | null>(null);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [busyStepId, setBusyStepId] = useState<string | null>(null);

  if (!directorInstalled) {
    return (
      <EmptyState
        title="L'Agent Director n'est pas installé"
        description="Installez-le depuis le catalogue d'agents pour commencer à lui soumettre des demandes."
        action={
          <Link href="/settings/agents" className="btn-primary">
            Aller au catalogue
          </Link>
        }
      />
    );
  }

  async function loadPlanGraph(planId: string) {
    setSelectedPlanId(planId);
    setLoadingGraph(true);
    try {
      const data = await apiGet<{
        plan: { steps: StepRow[] };
        nodes: PlanGraphNode[];
        edges: PlanGraphEdge[];
      }>(`/api/agents/director/plans/${planId}`);
      setGraph({ nodes: data.nodes, edges: data.edges, steps: data.plan.steps });
    } catch (err) {
      push({
        title: "Impossible de charger le plan",
        description: err instanceof ApiError ? err.message : "Erreur inattendue.",
        variant: "error",
      });
    } finally {
      setLoadingGraph(false);
    }
  }

  async function handleSubmitObjective() {
    if (!objective.trim()) return;
    setSubmitting(true);
    try {
      const { plan } = await apiPost<{ plan: { id: string } | null }>("/api/agents/director/requests", { objective });
      push({ title: "Demande traitée par le Director", variant: "success" });
      setObjective("");
      router.refresh();
      if (plan) await loadPlanGraph(plan.id);
    } catch (err) {
      push({
        title: "La demande a échoué",
        description: err instanceof ApiError ? err.message : "Erreur inattendue.",
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStepAction(stepId: string, action: "cancel" | "retry") {
    if (!selectedPlanId) return;
    setBusyStepId(stepId);
    try {
      await apiPost(`/api/agents/director/plans/${selectedPlanId}/steps/${stepId}/${action}`);
      await loadPlanGraph(selectedPlanId);
      router.refresh();
    } catch (err) {
      push({
        title: "Action impossible",
        description: err instanceof ApiError ? err.message : "Erreur inattendue.",
        variant: "error",
      });
    } finally {
      setBusyStepId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Badge variant={directorStatus === "ACTIVE" ? "success" : "warning"}>{directorStatus ?? "?"}</Badge>
        <span className="text-sm text-p360-muted">{activeAgents.length} agent(s) actif(s) disponible(s) pour délégation</span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <StatTile label="Tâches en attente" value={String(tasks.pending)} />
        <StatTile label="Tâches terminées" value={String(tasks.completed)} />
        <StatTile label="Tâches échouées" value={String(tasks.failed)} />
        <StatTile label="Tâches ignorées" value={String(tasks.skipped)} />
        <StatTile label="Tâches annulées" value={String(tasks.cancelled)} />
        <StatTile label="File d'exécution" value={String(queuedRuns)} sub="runs en attente" />
        <StatTile
          label="Coût IA estimé"
          value={`${consumption.estimatedAiCostUsd.toFixed(4)} $`}
          sub={`${consumption.aiRequestCount} appel(s)`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nouvelle demande</CardTitle>
        </CardHeader>
        <div className="space-y-3">
          <textarea
            className="input min-h-24 w-full"
            placeholder="Décrivez l'objectif à atteindre (ex. « obtenir un état du pipeline CRM »)…"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
          />
          <Button variant="primary" loading={submitting} disabled={!objective.trim()} onClick={handleSubmitObjective}>
            Soumettre au Director
          </Button>
          <p className="text-xs text-p360-muted">
            Le Director décompose automatiquement l&apos;objectif (correspondance par catégorie d&apos;agent — voir ADR
            0011) et délègue à l&apos;agent le plus adapté parmi les agents actifs du workspace.
          </p>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Agents actifs</CardTitle>
          </CardHeader>
          {activeAgents.length === 0 ? (
            <EmptyState title="Aucun agent actif" description="Installez et activez un agent pour que le Director puisse déléguer." />
          ) : (
            <ul className="space-y-1 text-sm">
              {activeAgents.map((agent) => (
                <li key={agent.id} className="flex items-center gap-2">
                  <span>{agent.icon ?? "🤖"}</span>
                  <Link href={`/settings/agents/${agent.id}`} className="hover:underline">
                    {agent.name}
                  </Link>
                  <Badge variant="neutral">{agent.category}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Planifications actives</CardTitle>
          </CardHeader>
          {activeSchedules.length === 0 ? (
            <EmptyState title="Aucune planification active" />
          ) : (
            <ul className="space-y-1 text-sm">
              {activeSchedules.map((schedule) => (
                <li key={schedule.id} className="flex items-center justify-between">
                  <span>
                    <Badge variant="neutral">{schedule.kind}</Badge> {schedule.agentName}
                  </span>
                  <span className="text-xs text-p360-muted">
                    {schedule.nextRunAt ? new Date(schedule.nextRunAt).toLocaleString("fr-FR") : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Historique des plans</CardTitle>
        </CardHeader>
        {recentPlans.length === 0 ? (
          <EmptyState title="Aucun plan généré" description="Soumettez une demande ci-dessus pour que le Director génère son premier plan." />
        ) : (
          <div className="divide-y divide-p360-lavender-light">
            {recentPlans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => loadPlanGraph(plan.id)}
                className="flex w-full items-center justify-between py-2 text-left text-sm hover:bg-p360-lavender-light/20"
              >
                <span className="flex items-center gap-2">
                  <Badge variant={PLAN_STATUS_VARIANT[plan.status] ?? "neutral"}>{plan.status}</Badge>
                  <span className="text-p360-ink">{plan.goal}</span>
                  <span className="text-xs text-p360-muted">{plan.stepCount} étape(s)</span>
                </span>
                <span className="text-xs text-p360-muted">{new Date(plan.createdAt).toLocaleString("fr-FR")}</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      {selectedPlanId && (
        <Card>
          <CardHeader>
            <CardTitle>Graphe du plan</CardTitle>
          </CardHeader>
          {loadingGraph || !graph ? (
            <p className="text-sm text-p360-muted">Chargement…</p>
          ) : (
            <div className="space-y-4">
              <DirectorPlanGraph nodes={graph.nodes} edges={graph.edges} />
              <div className="space-y-2">
                {graph.steps.map((step) => (
                  <div key={step.id} className="flex items-center justify-between rounded-lg border border-p360-lavender-light p-3 text-sm">
                    <span className="flex items-center gap-2">
                      <Badge variant={STEP_STATUS_VARIANT[step.status] ?? "neutral"}>{step.status}</Badge>
                      <span>{step.objective}</span>
                      <span className="text-xs text-p360-muted">→ {step.targetLabel}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {(step.status === "PENDING" ||
                        step.status === "READY" ||
                        step.status === "DELEGATED" ||
                        step.status === "RUNNING") && (
                        <Button
                          variant="secondary"
                          loading={busyStepId === step.id}
                          onClick={() => handleStepAction(step.id, "cancel")}
                        >
                          Annuler
                        </Button>
                      )}
                      {(step.status === "FAILED" || step.status === "CANCELLED") && (
                        <Button
                          variant="secondary"
                          loading={busyStepId === step.id}
                          onClick={() => handleStepAction(step.id, "retry")}
                        >
                          Relancer
                        </Button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Journal des communications</CardTitle>
        </CardHeader>
        {recentMessages.length === 0 ? (
          <EmptyState title="Aucun message" />
        ) : (
          <ul className="space-y-1 text-sm">
            {recentMessages.map((message) => (
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
