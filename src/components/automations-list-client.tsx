"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/stat-tile";
import { useToast } from "@/components/ui/toast-provider";

type AutomationRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
  status: string;
  isTemplate: boolean;
  updatedAt: string;
};

type Dashboard = {
  automations: { counts: { active: number; inactive: number; draft: number; archived: number; total: number } };
  runs: {
    counts: { queued: number; running: number; waiting: number; succeeded: number; failed: number; cancelled: number; total: number };
    successRate: number | null;
    failureRate: number | null;
    durationMs: { average: number | null; min: number | null; max: number | null };
  };
  jobs: {
    counts: { queued: number; claimed: number; running: number; waiting: number; succeeded: number; failed: number; cancelled: number; deadLettered: number; total: number };
    totalRetries: number;
    byJobType: { jobType: string; total: number; failed: number; failureRate: number; averageDurationMs: number | null }[];
  };
  queue: { dueNow: number; workerPoolSize: number; activeWorkers: number };
  timeSaved: { totalMinutes: number; totalHours: number; byJobType: { jobType: string; succeededCount: number; minutesSaved: number }[] };
};

const STATUS_VARIANT: Record<string, "neutral" | "success" | "warning" | "danger" | "info"> = {
  DRAFT: "neutral",
  ACTIVE: "success",
  INACTIVE: "warning",
  ARCHIVED: "danger",
};

function pct(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}
function ms(value: number | null) {
  return value === null ? "—" : `${Math.round(value)} ms`;
}

export function AutomationsListClient({
  automations,
  templates,
  dashboard,
  canManage,
}: {
  automations: AutomationRow[];
  templates: AutomationRow[];
  dashboard: Dashboard;
  canManage: boolean;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("général");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function createBlank() {
    setBusy("create");
    try {
      const blankGraph = {
        nodes: [
          { id: "t1", type: "trigger", position: { x: 0, y: 0 }, data: { triggerKey: "manual.user_action" } },
          { id: "end1", type: "end", position: { x: 0, y: 150 }, data: {} },
        ],
        edges: [{ id: "e1", source: "t1", target: "end1" }],
      };
      const result = await apiPost<{ automation: { id: string } }>("/api/automations", { key, name, category, graph: blankGraph });
      push({ title: "Automatisation créée", variant: "success" });
      router.push(`/automations/${result.automation.id}`);
    } catch (error) {
      push({ title: "Échec de la création", description: (error as Error).message, variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function cloneTemplate(templateId: string, templateKey: string) {
    const newKey = window.prompt("Clé de la nouvelle automatisation :", `${templateKey}-1`);
    if (!newKey) return;
    const newName = window.prompt("Nom de la nouvelle automatisation :", newKey) ?? newKey;
    setBusy(`clone-${templateId}`);
    try {
      const result = await apiPost<{ automation: { id: string } }>(`/api/automations/${templateId}/clone`, { newKey, newName });
      push({ title: "Modèle cloné", variant: "success" });
      router.push(`/automations/${result.automation.id}`);
    } catch (error) {
      push({ title: "Échec du clonage", description: (error as Error).message, variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function handleImport(file: File) {
    setBusy("import");
    try {
      const payload = JSON.parse(await file.text());
      const result = await apiPost<{ automation: { id: string } }>("/api/automations/import", payload);
      push({ title: "Automatisation importée", variant: "success" });
      router.push(`/automations/${result.automation.id}`);
    } catch (error) {
      push({ title: "Échec de l'import", description: (error as Error).message, variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Automatisations actives" value={String(dashboard.automations.counts.active)} />
        <StatTile
          label="Temps gagné (estimation)"
          value={`${dashboard.timeSaved.totalHours} h`}
          sub={`${dashboard.jobs.counts.succeeded} action(s) automatisée(s)`}
        />
        <StatTile label="Jobs en file" value={String(dashboard.jobs.counts.queued)} sub={`${dashboard.queue.dueNow} prêt(s) maintenant`} />
        <StatTile label="Jobs en cours" value={String(dashboard.jobs.counts.running)} />
        <StatTile label="Workers actifs" value={`${dashboard.queue.activeWorkers} / ${dashboard.queue.workerPoolSize}`} />
        <StatTile label="Taux de succès (runs)" value={pct(dashboard.runs.successRate)} sub={`${dashboard.runs.counts.total} exécution(s)`} />
        <StatTile label="Taux d'échec (runs)" value={pct(dashboard.runs.failureRate)} />
        <StatTile label="Durée moyenne (runs)" value={ms(dashboard.runs.durationMs.average)} />
        <StatTile label="Dead Letter Queue" value={String(dashboard.jobs.counts.deadLettered)} sub={`${dashboard.jobs.totalRetries} tentative(s) au total`} />
      </div>

      {dashboard.jobs.byJobType.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Types de jobs les plus lents</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-p360-muted">
                <tr>
                  <th className="py-1">Type de job</th>
                  <th className="py-1">Exécutions</th>
                  <th className="py-1">Échecs</th>
                  <th className="py-1">Durée moyenne</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.jobs.byJobType.map((b) => (
                  <tr key={b.jobType} className="border-t border-p360-lavender-light">
                    <td className="py-1">{b.jobType}</td>
                    <td className="py-1">{b.total}</td>
                    <td className="py-1">{Math.round(b.failureRate * 100)}%</td>
                    <td className="py-1">{ms(b.averageDurationMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Mes automatisations</CardTitle>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setShowCreate((v) => !v)}>
                + Nouvelle automatisation
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])}
              />
              <Button variant="ghost" loading={busy === "import"} onClick={() => fileInputRef.current?.click()}>
                Importer
              </Button>
              <Link href="/automations/dlq">
                <Button variant="ghost">Dead Letter Queue</Button>
              </Link>
            </div>
          )}
        </CardHeader>

        {showCreate && (
          <div className="mb-4 flex flex-wrap items-end gap-2 rounded-md border border-p360-lavender-light p-3">
            <label className="text-xs">
              <span className="mb-1 block font-medium">Clé</span>
              <input className="rounded-md border border-p360-lavender-light p-1.5" value={key} onChange={(e) => setKey(e.target.value)} placeholder="mon-automatisation" />
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-medium">Nom</span>
              <input className="rounded-md border border-p360-lavender-light p-1.5" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-medium">Catégorie</span>
              <input className="rounded-md border border-p360-lavender-light p-1.5" value={category} onChange={(e) => setCategory(e.target.value)} />
            </label>
            <Button loading={busy === "create"} disabled={!key || !name} onClick={createBlank}>
              Créer (vide)
            </Button>
          </div>
        )}

        {automations.length === 0 ? (
          <EmptyState title="Aucune automatisation" description="Créez une automatisation vide ou clonez un modèle ci-dessous." />
        ) : (
          <ul className="space-y-2">
            {automations.map((a) => (
              <li key={a.id} className="flex items-center justify-between rounded-md border border-p360-lavender-light p-3">
                <div>
                  <Link href={`/automations/${a.id}`} className="font-medium text-p360-blue underline">
                    {a.name}
                  </Link>
                  <p className="text-xs text-p360-muted">
                    {a.key} · {a.category}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[a.status] ?? "neutral"}>{a.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Modèles prêts à l&apos;emploi</CardTitle>
        </CardHeader>
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {templates.map((t) => (
            <li key={t.id} className="rounded-md border border-p360-lavender-light p-3">
              <p className="font-medium text-p360-ink">{t.name}</p>
              <p className="mb-2 text-xs text-p360-muted">{t.description}</p>
              {canManage && (
                <Button variant="secondary" loading={busy === `clone-${t.id}`} onClick={() => cloneTemplate(t.id, t.key)}>
                  Cloner dans mon workspace
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
