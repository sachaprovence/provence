"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast-provider";

type VersionRow = { id: string; version: number; changelog: string | null; createdAt: string };
type RunRow = { id: string; status: string; trigger: string; createdAt: string; finishedAt: string | null };
type RegistryEntry = { key: string; name: string; description: string; category: string };

const STATUS_VARIANT: Record<string, "neutral" | "success" | "warning" | "danger" | "info"> = {
  DRAFT: "neutral",
  ACTIVE: "success",
  INACTIVE: "warning",
  ARCHIVED: "danger",
  QUEUED: "neutral",
  RUNNING: "info",
  WAITING: "warning",
  SUCCEEDED: "success",
  FAILED: "danger",
  CANCELLED: "warning",
  TIMED_OUT: "danger",
};

export function AutomationEditorClient({
  automationId,
  automationKey,
  status,
  activeVersionId,
  versions,
  recentRuns,
  initialGraph,
  registry,
  canManage,
}: {
  automationId: string;
  automationKey: string;
  status: string;
  activeVersionId: string | null;
  versions: VersionRow[];
  recentRuns: RunRow[];
  initialGraph: unknown;
  registry: { triggers: RegistryEntry[]; actions: RegistryEntry[] };
  canManage: boolean;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [graphText, setGraphText] = useState(() => JSON.stringify(initialGraph, null, 2));
  const [changelog, setChangelog] = useState("");
  const [runInput, setRunInput] = useState("{}");
  const [showRegistry, setShowRegistry] = useState(false);

  async function saveNewVersion() {
    setBusy("save");
    try {
      const graph = JSON.parse(graphText);
      await apiPost(`/api/automations/${automationId}/versions`, { graph, changelog: changelog || undefined });
      push({ title: "Nouvelle version créée", variant: "success" });
      router.refresh();
    } catch (error) {
      push({ title: "Échec de l'enregistrement", description: (error as Error).message, variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function activate(versionId: string) {
    setBusy(`activate-${versionId}`);
    try {
      await apiPost(`/api/automations/${automationId}/activate`, { versionId });
      push({ title: "Version activée", variant: "success" });
      router.refresh();
    } catch (error) {
      push({ title: "Échec de l'activation", description: (error as Error).message, variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function deactivate() {
    setBusy("deactivate");
    try {
      await apiPost(`/api/automations/${automationId}/deactivate`);
      push({ title: "Automatisation désactivée", variant: "info" });
      router.refresh();
    } catch (error) {
      push({ title: "Échec", description: (error as Error).message, variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function archive() {
    if (!window.confirm("Archiver cette automatisation ? Cette action est définitive.")) return;
    setBusy("archive");
    try {
      await apiPost(`/api/automations/${automationId}/archive`);
      push({ title: "Automatisation archivée", variant: "info" });
      router.refresh();
    } catch (error) {
      push({ title: "Échec", description: (error as Error).message, variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function exportAutomation() {
    const res = await fetch(`/api/automations/${automationId}/export`);
    if (!res.ok) {
      push({ title: "Échec de l'export", variant: "error" });
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${automationKey}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function runNow() {
    setBusy("run");
    try {
      const input = runInput.trim() ? JSON.parse(runInput) : undefined;
      const result = await apiPost<{ run: { id: string } }>(`/api/automations/${automationId}/run`, { input });
      push({ title: "Automatisation déclenchée", variant: "success" });
      router.push(`/automations/runs/${result.run.id}`);
    } catch (error) {
      push({ title: "Échec du déclenchement", description: (error as Error).message, variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  const canRun = status === "ACTIVE";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>
              {automationKey} <Badge variant={STATUS_VARIANT[status] ?? "neutral"}>{status}</Badge>
            </CardTitle>
          </div>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={exportAutomation}>
                Exporter
              </Button>
              {status === "ACTIVE" && (
                <Button variant="secondary" loading={busy === "deactivate"} onClick={deactivate}>
                  Désactiver
                </Button>
              )}
              {status !== "ARCHIVED" && (
                <Button variant="danger" loading={busy === "archive"} onClick={archive}>
                  Archiver
                </Button>
              )}
            </div>
          )}
        </CardHeader>

        {canManage && canRun && (
          <div className="flex flex-wrap items-end gap-2 rounded-md border border-p360-lavender-light p-3">
            <label className="flex-1 text-xs">
              <span className="mb-1 block font-medium">Entrée (JSON, optionnel)</span>
              <input
                className="w-full rounded-md border border-p360-lavender-light p-1.5 font-mono"
                value={runInput}
                onChange={(e) => setRunInput(e.target.value)}
              />
            </label>
            <Button loading={busy === "run"} onClick={runNow}>
              Déclencher manuellement
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Versions</CardTitle>
        </CardHeader>
        {versions.length === 0 ? (
          <EmptyState title="Aucune version" description="Enregistrez une première version ci-dessous." />
        ) : (
          <ul className="space-y-2">
            {versions.map((v) => (
              <li key={v.id} className="flex items-center justify-between rounded-md border border-p360-lavender-light p-2 text-sm">
                <div>
                  <span className="font-medium">v{v.version}</span>
                  {v.id === activeVersionId && <Badge variant="success">active</Badge>}
                  {v.changelog && <p className="text-xs text-p360-muted">{v.changelog}</p>}
                </div>
                {canManage && v.id !== activeVersionId && (
                  <Button variant="secondary" loading={busy === `activate-${v.id}`} onClick={() => activate(v.id)}>
                    Activer
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Graphe (édition JSON)</CardTitle>
          </CardHeader>
          <textarea
            className="h-80 w-full rounded-md border border-p360-lavender-light p-2 font-mono text-xs"
            value={graphText}
            onChange={(e) => setGraphText(e.target.value)}
            spellCheck={false}
          />
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="text-xs">
              <span className="mb-1 block font-medium">Note de version (optionnel)</span>
              <input className="rounded-md border border-p360-lavender-light p-1.5" value={changelog} onChange={(e) => setChangelog(e.target.value)} />
            </label>
            <Button loading={busy === "save"} onClick={saveNewVersion}>
              Enregistrer comme nouvelle version
            </Button>
            <Button variant="ghost" onClick={() => setShowRegistry((v) => !v)}>
              {showRegistry ? "Masquer" : "Afficher"} le catalogue déclencheurs/actions
            </Button>
          </div>

          {showRegistry && (
            <div className="mt-3 grid grid-cols-1 gap-3 text-xs md:grid-cols-2">
              <div>
                <p className="mb-1 font-semibold text-p360-muted">Déclencheurs ({registry.triggers.length})</p>
                <ul className="max-h-64 space-y-1 overflow-y-auto">
                  {registry.triggers.map((t) => (
                    <li key={t.key} className="rounded border border-p360-lavender-light p-1.5">
                      <code className="font-mono">{t.key}</code> — {t.name}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 font-semibold text-p360-muted">Actions ({registry.actions.length})</p>
                <ul className="max-h-64 space-y-1 overflow-y-auto">
                  {registry.actions.map((a) => (
                    <li key={a.key} className="rounded border border-p360-lavender-light p-1.5">
                      <code className="font-mono">{a.key}</code> — {a.name}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Exécutions récentes</CardTitle>
        </CardHeader>
        {recentRuns.length === 0 ? (
          <EmptyState title="Aucune exécution" description="Déclenchez l'automatisation manuellement ou activez un déclencheur." />
        ) : (
          <ul className="space-y-2">
            {recentRuns.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-md border border-p360-lavender-light p-2 text-sm">
                <div>
                  <Link href={`/automations/runs/${r.id}`} className="text-p360-blue underline">
                    {r.id}
                  </Link>
                  <p className="text-xs text-p360-muted">
                    {r.trigger} · {new Date(r.createdAt).toLocaleString("fr-FR")}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[r.status] ?? "neutral"}>{r.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
