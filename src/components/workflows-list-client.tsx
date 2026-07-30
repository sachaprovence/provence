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

type DefinitionRow = {
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
  definitionCounts: { active: number; inactive: number; draft: number; archived: number };
  runCounts: { queued: number; running: number; waiting: number; succeeded: number; failed: number; cancelled: number; total: number };
  successRate: number | null;
  failureRate: number | null;
  averageDurationMs: number | null;
  bottlenecks: { nodeType: string; actionKey: string | null; total: number; failed: number; failureRate: number; averageDurationMs: number | null }[];
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

export function WorkflowsListClient({
  definitions,
  templates,
  dashboard,
  canManage,
}: {
  definitions: DefinitionRow[];
  templates: DefinitionRow[];
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
          { id: "t1", type: "trigger", position: { x: 0, y: 0 }, data: { triggerKey: "user.action" } },
          { id: "end1", type: "end", position: { x: 0, y: 150 }, data: {} },
        ],
        edges: [{ id: "e1", source: "t1", target: "end1" }],
      };
      const result = await apiPost<{ definition: { id: string } }>("/api/workflows", { key, name, category, graph: blankGraph });
      push({ title: "Workflow créé", variant: "success" });
      router.push(`/workflows/${result.definition.id}`);
    } catch (error) {
      push({ title: "Échec de la création", description: (error as Error).message, variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function cloneTemplate(templateId: string, templateKey: string) {
    const newKey = window.prompt("Clé du nouveau workflow :", `${templateKey}-1`);
    if (!newKey) return;
    const newName = window.prompt("Nom du nouveau workflow :", newKey) ?? newKey;
    setBusy(`clone-${templateId}`);
    try {
      const result = await apiPost<{ definition: { id: string } }>(`/api/workflows/${templateId}/clone`, { newKey, newName });
      push({ title: "Modèle cloné", variant: "success" });
      router.push(`/workflows/${result.definition.id}`);
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
      const result = await apiPost<{ definition: { id: string } }>("/api/workflows/import", payload);
      push({ title: "Workflow importé", variant: "success" });
      router.push(`/workflows/${result.definition.id}`);
    } catch (error) {
      push({ title: "Échec de l'import", description: (error as Error).message, variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Workflows actifs" value={String(dashboard.definitionCounts.active)} />
        <StatTile label="En file d'attente" value={String(dashboard.runCounts.queued)} />
        <StatTile label="En cours" value={String(dashboard.runCounts.running)} />
        <StatTile label="En attente" value={String(dashboard.runCounts.waiting)} />
        <StatTile label="Taux de succès" value={pct(dashboard.successRate)} sub={`${dashboard.runCounts.total} exécution(s)`} />
        <StatTile label="Taux d'échec" value={pct(dashboard.failureRate)} />
        <StatTile label="Durée moyenne" value={ms(dashboard.averageDurationMs)} />
        <StatTile label="Modèles disponibles" value={String(templates.length)} />
      </div>

      {dashboard.bottlenecks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Goulots d&apos;étranglement</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-p360-muted">
                <tr>
                  <th className="py-1">Noeud</th>
                  <th className="py-1">Exécutions</th>
                  <th className="py-1">Échecs</th>
                  <th className="py-1">Durée moyenne</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.bottlenecks.map((b, i) => (
                  <tr key={i} className="border-t border-p360-lavender-light">
                    <td className="py-1">
                      {b.nodeType}
                      {b.actionKey ? ` (${b.actionKey})` : ""}
                    </td>
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
          <CardTitle>Mes workflows</CardTitle>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setShowCreate((v) => !v)}>
                + Nouveau workflow
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
            </div>
          )}
        </CardHeader>

        {showCreate && (
          <div className="mb-4 flex flex-wrap items-end gap-2 rounded-md border border-p360-lavender-light p-3">
            <label className="text-xs">
              <span className="mb-1 block font-medium">Clé</span>
              <input className="rounded-md border border-p360-lavender-light p-1.5" value={key} onChange={(e) => setKey(e.target.value)} placeholder="mon-workflow" />
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

        {definitions.length === 0 ? (
          <EmptyState title="Aucun workflow" description="Créez un workflow vide ou clonez un modèle ci-dessous." />
        ) : (
          <ul className="space-y-2">
            {definitions.map((d) => (
              <li key={d.id} className="flex items-center justify-between rounded-md border border-p360-lavender-light p-3">
                <div>
                  <Link href={`/workflows/${d.id}`} className="font-medium text-p360-blue underline">
                    {d.name}
                  </Link>
                  <p className="text-xs text-p360-muted">
                    {d.key} · {d.category}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[d.status] ?? "neutral"}>{d.status}</Badge>
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
