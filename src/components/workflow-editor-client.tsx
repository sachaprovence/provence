"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast-provider";
import { WorkflowGraphCanvas, type CanvasNode, type CanvasEdge } from "@/components/workflow-graph-canvas";
import { validateWorkflowGraph } from "@/lib/workflows/graph-validation";
import type { WorkflowGraph, WorkflowNode, WorkflowNodeType } from "@/lib/workflows/graph-types";

type RegistryTrigger = { key: string; name: string; description: string; category: string; kind: string };
type RegistryAction = { key: string; name: string; description: string; category: string };
type VersionRow = { id: string; version: number; changelog: string | null; createdAt: string };
type RunRow = { id: string; status: string; trigger: string; createdAt: string; finishedAt: string | null };

const NODE_TYPES: { type: WorkflowNodeType; label: string }[] = [
  { type: "trigger", label: "Déclencheur" },
  { type: "condition", label: "Condition" },
  { type: "action", label: "Action" },
  { type: "loop", label: "Boucle" },
  { type: "wait", label: "Attente / délai" },
  { type: "subworkflow", label: "Sous-workflow" },
  { type: "end", label: "Fin" },
];

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

/** Défini hors du composant : un générateur d'id n'a pas besoin d'être pur, mais le corps d'un composant/hook doit l'être (voir react-hooks/purity). */
function generateId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultDataFor(type: WorkflowNodeType): WorkflowNode["data"] {
  switch (type) {
    case "trigger":
      return { triggerKey: "user.action" };
    case "condition":
      return { rule: { op: "true" } };
    case "action":
      return { actionKey: "notification.create", input: {} };
    case "loop":
      return { collectionExpr: { kind: "var", path: "context.items" }, itemVar: "item", bodyNodeIds: [] };
    case "wait":
      return { delayMs: 60000 };
    case "subworkflow":
      return { workflowKey: "" };
    case "end":
      return {};
  }
}

function JsonField({ label, value, onChange, rows = 4 }: { label: string; value: unknown; onChange: (v: unknown) => void; rows?: number }) {
  const [text, setText] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [error, setError] = useState<string | null>(null);
  return (
    <label className="block text-xs">
      <span className="mb-1 block font-medium text-p360-ink">{label}</span>
      <textarea
        className="w-full rounded-md border border-p360-lavender-light p-2 font-mono text-xs"
        rows={rows}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          try {
            const parsed = JSON.parse(text);
            setError(null);
            onChange(parsed);
          } catch {
            setError("JSON invalide — non enregistré.");
          }
        }}
      />
      {error && <span className="text-p360-danger">{error}</span>}
    </label>
  );
}

export function WorkflowEditorClient({
  definitionId,
  definitionKey,
  status,
  activeVersionId,
  versions,
  recentRuns,
  initialGraph,
  registry,
  canManage,
}: {
  definitionId: string;
  definitionKey: string;
  status: string;
  activeVersionId: string | null;
  versions: VersionRow[];
  recentRuns: RunRow[];
  initialGraph: WorkflowGraph;
  registry: { triggers: RegistryTrigger[]; actions: RegistryAction[] };
  canManage: boolean;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [graph, setGraph] = useState<WorkflowGraph>(initialGraph);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);
  const [changelog, setChangelog] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [showVariables, setShowVariables] = useState(false);

  const issues = useMemo(() => validateWorkflowGraph(graph), [graph]);
  const selectedNode = graph.nodes.find((n) => n.id === selectedNodeId) ?? null;
  const selectedEdge = graph.edges.find((e) => e.id === selectedEdgeId) ?? null;

  const canvasNodes: CanvasNode[] = graph.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    label: n.label ?? nodeSummary(n, registry),
    position: n.position,
    hasIssue: issues.some((i) => i.includes(`"${n.id}"`)),
  }));
  const canvasEdges: CanvasEdge[] = graph.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, branch: e.branch }));

  function updateGraph(updater: (g: WorkflowGraph) => WorkflowGraph) {
    setGraph((g) => updater(g));
  }

  function addNode(type: WorkflowNodeType) {
    const id = generateId(type);
    const offset = graph.nodes.length * 20;
    updateGraph((g) => ({
      ...g,
      nodes: [...g.nodes, { id, type, position: { x: 100 + (offset % 400), y: 60 + offset }, data: defaultDataFor(type) }],
    }));
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
  }

  function updateNode(id: string, patch: Partial<WorkflowNode>) {
    updateGraph((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));
  }

  function updateNodeData(id: string, dataPatch: Record<string, unknown>) {
    updateGraph((g) => ({
      ...g,
      nodes: g.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...dataPatch } as WorkflowNode["data"] } : n)),
    }));
  }

  function deleteNode(id: string) {
    updateGraph((g) => ({
      nodes: g.nodes.filter((n) => n.id !== id),
      edges: g.edges.filter((e) => e.source !== id && e.target !== id),
      variables: g.variables,
    }));
    setSelectedNodeId(null);
  }

  function deleteEdge(id: string) {
    updateGraph((g) => ({ ...g, edges: g.edges.filter((e) => e.id !== id) }));
    setSelectedEdgeId(null);
  }

  function moveNode(id: string, position: { x: number; y: number }) {
    updateGraph((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, position } : n)) }));
  }

  function completeConnection(targetId: string) {
    if (!connectingFromId) return;
    const id = generateId("edge");
    updateGraph((g) => ({ ...g, edges: [...g.edges, { id, source: connectingFromId, target: targetId }] }));
    setConnectingFromId(null);
  }

  async function saveVersion() {
    if (issues.length > 0) {
      push({ title: "Le graphe contient des erreurs", description: issues[0], variant: "error" });
      return;
    }
    setBusy("save");
    try {
      await apiPost(`/api/workflows/${definitionId}/versions`, { graph, changelog: changelog || undefined });
      push({ title: "Nouvelle version enregistrée", variant: "success" });
      setChangelog("");
      router.refresh();
    } catch (error) {
      push({ title: "Échec de l'enregistrement", description: (error as Error).message, variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function activate(versionId: string) {
    setBusy("activate");
    try {
      await apiPost(`/api/workflows/${definitionId}/activate`, { versionId });
      push({ title: "Workflow activé", variant: "success" });
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
      await apiPost(`/api/workflows/${definitionId}/deactivate`);
      push({ title: "Workflow désactivé", variant: "info" });
      router.refresh();
    } catch (error) {
      push({ title: "Échec", description: (error as Error).message, variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function archive() {
    setBusy("archive");
    try {
      await apiPost(`/api/workflows/${definitionId}/archive`);
      push({ title: "Workflow archivé", variant: "info" });
      router.refresh();
    } catch (error) {
      push({ title: "Échec", description: (error as Error).message, variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function cloneWorkflow() {
    const newKey = window.prompt("Clé du nouveau workflow (minuscules, chiffres, tirets) :", `${definitionKey}-copie`);
    if (!newKey) return;
    const newName = window.prompt("Nom du nouveau workflow :", newKey) ?? newKey;
    setBusy("clone");
    try {
      const result = await apiPost<{ definition: { id: string } }>(`/api/workflows/${definitionId}/clone`, { newKey, newName });
      push({ title: "Workflow cloné", variant: "success" });
      router.push(`/workflows/${result.definition.id}`);
    } catch (error) {
      push({ title: "Échec du clonage", description: (error as Error).message, variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function exportWorkflow() {
    const res = await fetch(`/api/workflows/${definitionId}/export`);
    if (!res.ok) {
      push({ title: "Échec de l'export", variant: "error" });
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${definitionKey}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function triggerRun() {
    setBusy("run");
    try {
      const result = await apiPost<{ run: { id: string; status: string } }>(`/api/workflows/${definitionId}/run`, { input: {} });
      push({ title: `Exécution déclenchée (${result.run.status})`, variant: "success" });
      router.push(`/workflows/runs/${result.run.id}`);
    } catch (error) {
      push({ title: "Échec du déclenchement", description: (error as Error).message, variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle>Éditeur de graphe</CardTitle>
            <Badge variant={STATUS_VARIANT[status] ?? "neutral"}>{status}</Badge>
          </div>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" loading={busy === "run"} onClick={triggerRun}>
                ▶ Déclencher
              </Button>
              <Button variant="secondary" loading={busy === "clone"} onClick={cloneWorkflow}>
                Cloner
              </Button>
              <Button variant="ghost" onClick={exportWorkflow}>
                Exporter
              </Button>
              {status !== "ARCHIVED" && (
                <Button variant="danger" loading={busy === "archive"} onClick={archive}>
                  Archiver
                </Button>
              )}
            </div>
          )}
        </CardHeader>

        {issues.length > 0 && (
          <div className="mb-3 rounded-md border border-p360-danger bg-red-50 p-3 text-xs text-p360-danger">
            <p className="mb-1 font-semibold">⚠️ Validation graphique : {issues.length} problème(s)</p>
            <ul className="list-disc pl-4">
              {issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mb-3 flex flex-wrap gap-1.5">
          {NODE_TYPES.map((nt) => (
            <button
              key={nt.type}
              type="button"
              className="btn-ghost px-2 py-1 text-xs"
              disabled={!canManage}
              onClick={() => addNode(nt.type)}
            >
              + {nt.label}
            </button>
          ))}
          <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setShowVariables((v) => !v)}>
            🔍 Inspecteur de variables
          </button>
        </div>

        {connectingFromId && (
          <p className="mb-2 text-xs text-p360-blue">
            Mode connexion actif — cliquez sur le noeud cible.{" "}
            <button type="button" className="underline" onClick={() => setConnectingFromId(null)}>
              Annuler
            </button>
          </p>
        )}

        {showVariables && <VariableInspector graph={graph} onChange={setGraph} />}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
          <WorkflowGraphCanvas
            nodes={canvasNodes}
            edges={canvasEdges}
            selectedNodeId={selectedNodeId}
            selectedEdgeId={selectedEdgeId}
            connectingFromId={connectingFromId}
            onSelectNode={(id) => {
              setSelectedNodeId(id);
              setSelectedEdgeId(null);
            }}
            onSelectEdge={(id) => {
              setSelectedEdgeId(id);
              setSelectedNodeId(null);
            }}
            onMoveNode={moveNode}
            onCompleteConnection={completeConnection}
            onBackgroundClick={() => {
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
            }}
          />

          <div className="rounded-lg border border-p360-lavender-light p-3">
            {selectedNode && (
              <NodeInspector
                key={selectedNode.id}
                node={selectedNode}
                allNodes={graph.nodes}
                registry={registry}
                canManage={canManage}
                onChangeLabel={(label) => updateNode(selectedNode.id, { label })}
                onChangeData={(patch) => updateNodeData(selectedNode.id, patch)}
                onConnect={() => setConnectingFromId(selectedNode.id)}
                onDelete={() => deleteNode(selectedNode.id)}
              />
            )}
            {selectedEdge && !selectedNode && (
              <EdgeInspector
                edge={selectedEdge}
                canManage={canManage}
                onChangeBranch={(branch) =>
                  updateGraph((g) => ({ ...g, edges: g.edges.map((e) => (e.id === selectedEdge.id ? { ...e, branch } : e)) }))
                }
                onDelete={() => deleteEdge(selectedEdge.id)}
              />
            )}
            {!selectedNode && !selectedEdge && (
              <p className="text-sm text-p360-muted">Sélectionnez un noeud ou une arête pour l&apos;éditer.</p>
            )}
          </div>
        </div>

        {canManage && (
          <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-p360-lavender-light pt-3">
            <label className="flex-1 text-xs">
              <span className="mb-1 block font-medium text-p360-ink">Note de version (changelog)</span>
              <input
                className="w-full rounded-md border border-p360-lavender-light p-2 text-sm"
                value={changelog}
                onChange={(e) => setChangelog(e.target.value)}
                placeholder="Ex. : ajout de la relance à J+3"
              />
            </label>
            <Button loading={busy === "save"} onClick={saveVersion}>
              Enregistrer une nouvelle version
            </Button>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Versions</CardTitle>
          </CardHeader>
          <ul className="space-y-2 text-sm">
            {versions.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 rounded-md border border-p360-lavender-light p-2">
                <div>
                  <span className="font-medium">v{v.version}</span>
                  {v.id === activeVersionId && (
                    <Badge variant="success" className="ml-2">
                      active
                    </Badge>
                  )}
                  {v.changelog && <p className="text-xs text-p360-muted">{v.changelog}</p>}
                </div>
                {canManage && v.id !== activeVersionId && (
                  <Button variant="secondary" loading={busy === "activate"} onClick={() => activate(v.id)}>
                    Activer
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {canManage && status === "ACTIVE" && (
            <div className="mt-3">
              <Button variant="ghost" loading={busy === "deactivate"} onClick={deactivate}>
                Désactiver le workflow
              </Button>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Exécutions récentes</CardTitle>
          </CardHeader>
          {recentRuns.length === 0 && <p className="text-sm text-p360-muted">Aucune exécution pour le moment.</p>}
          <ul className="space-y-2 text-sm">
            {recentRuns.map((run) => (
              <li key={run.id} className="flex items-center justify-between rounded-md border border-p360-lavender-light p-2">
                <div>
                  <Badge variant={STATUS_VARIANT[run.status] ?? "neutral"}>{run.status}</Badge>
                  <span className="ml-2 text-xs text-p360-muted">{run.trigger}</span>
                </div>
                <Link href={`/workflows/runs/${run.id}`} className="text-p360-blue underline">
                  Détail
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function nodeSummary(node: WorkflowNode, registry: { triggers: RegistryTrigger[]; actions: RegistryAction[] }): string {
  switch (node.type) {
    case "trigger": {
      const key = (node.data as { triggerKey?: string }).triggerKey;
      return registry.triggers.find((t) => t.key === key)?.name ?? key ?? "déclencheur";
    }
    case "action": {
      const key = (node.data as { actionKey?: string }).actionKey;
      return registry.actions.find((a) => a.key === key)?.name ?? key ?? "action";
    }
    case "condition":
      return "condition";
    case "loop":
      return `boucle (${(node.data as { itemVar?: string }).itemVar ?? "item"})`;
    case "wait":
      return "attente";
    case "subworkflow":
      return (node.data as { workflowKey?: string }).workflowKey || "sous-workflow";
    case "end":
      return "fin";
  }
}

function VariableInspector({ graph, onChange }: { graph: WorkflowGraph; onChange: (g: WorkflowGraph) => void }) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"workflow" | "context" | "form">("context");

  return (
    <div className="mb-3 rounded-md border border-p360-lavender-light p-3 text-xs">
      <p className="mb-2 font-semibold text-p360-ink">Inspecteur de variables</p>
      <p className="mb-2 text-p360-muted">
        Utilisez <code>{"{{ portée.chemin }}"}</code> dans les champs d&apos;une action. Portées disponibles :{" "}
        <code>workflow</code>, <code>context</code>, <code>user</code>, <code>organization</code>, <code>workspace</code>,{" "}
        <code>agents</code>, <code>results</code>, <code>api</code>, <code>form</code>.
      </p>
      <ul className="mb-2 space-y-1">
        {(graph.variables ?? []).map((v, i) => (
          <li key={i} className="flex items-center justify-between rounded bg-p360-sand-light/60 px-2 py-1">
            <span>
              <code>{v.scope}.{v.name}</code> {v.description && <span className="text-p360-muted"> — {v.description}</span>}
            </span>
            <button
              type="button"
              className="text-p360-danger"
              onClick={() => onChange({ ...graph, variables: (graph.variables ?? []).filter((_, idx) => idx !== i) })}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-1">
        <select className="rounded border border-p360-lavender-light" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
          <option value="workflow">workflow</option>
          <option value="context">context</option>
          <option value="form">form</option>
        </select>
        <input
          className="flex-1 rounded border border-p360-lavender-light px-1"
          placeholder="nom de variable"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="button"
          className="btn-ghost px-2 py-0.5"
          onClick={() => {
            if (!name.trim()) return;
            onChange({ ...graph, variables: [...(graph.variables ?? []), { name, scope }] });
            setName("");
          }}
        >
          Ajouter
        </button>
      </div>
    </div>
  );
}

function EdgeInspector({
  edge,
  canManage,
  onChangeBranch,
  onDelete,
}: {
  edge: CanvasEdge;
  canManage: boolean;
  onChangeBranch: (branch: string | undefined) => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-3 text-sm">
      <p className="font-semibold text-p360-ink">Arête : {edge.source} → {edge.target}</p>
      <label className="block text-xs">
        <span className="mb-1 block font-medium">Branche</span>
        <select
          className="w-full rounded-md border border-p360-lavender-light p-1.5"
          value={edge.branch ?? ""}
          disabled={!canManage}
          onChange={(e) => onChangeBranch(e.target.value || undefined)}
        >
          <option value="">(normal)</option>
          <option value="true">true (condition)</option>
          <option value="false">false (condition)</option>
          <option value="error">error (politique alternative_branch)</option>
        </select>
      </label>
      {canManage && (
        <Button variant="danger" onClick={onDelete}>
          Supprimer l&apos;arête
        </Button>
      )}
    </div>
  );
}

function NodeInspector({
  node,
  allNodes,
  registry,
  canManage,
  onChangeLabel,
  onChangeData,
  onConnect,
  onDelete,
}: {
  node: WorkflowNode;
  allNodes: WorkflowNode[];
  registry: { triggers: RegistryTrigger[]; actions: RegistryAction[] };
  canManage: boolean;
  onChangeLabel: (label: string) => void;
  onChangeData: (patch: Record<string, unknown>) => void;
  onConnect: () => void;
  onDelete: () => void;
}) {
  const data = node.data as Record<string, unknown>;

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-p360-ink">Noeud : {node.type}</p>
        {canManage && (
          <button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={onConnect}>
            🔗 Connecter →
          </button>
        )}
      </div>

      <label className="block text-xs">
        <span className="mb-1 block font-medium">Libellé (optionnel)</span>
        <input
          className="w-full rounded-md border border-p360-lavender-light p-1.5"
          value={node.label ?? ""}
          disabled={!canManage}
          onChange={(e) => onChangeLabel(e.target.value)}
        />
      </label>

      {node.type === "trigger" && (
        <label className="block text-xs">
          <span className="mb-1 block font-medium">Type de déclencheur</span>
          <select
            className="w-full rounded-md border border-p360-lavender-light p-1.5"
            value={(data.triggerKey as string) ?? ""}
            disabled={!canManage}
            onChange={(e) => onChangeData({ triggerKey: e.target.value })}
          >
            {registry.triggers.map((t) => (
              <option key={t.key} value={t.key}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {node.type === "condition" && (
        <JsonField label="Règle (JSON — voir graph-types.ts#Rule)" value={data.rule} onChange={(v) => onChangeData({ rule: v })} rows={6} />
      )}

      {node.type === "action" && (
        <>
          <label className="block text-xs">
            <span className="mb-1 block font-medium">Action</span>
            <select
              className="w-full rounded-md border border-p360-lavender-light p-1.5"
              value={(data.actionKey as string) ?? ""}
              disabled={!canManage}
              onChange={(e) => onChangeData({ actionKey: e.target.value })}
            >
              {registry.actions.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <JsonField label="Entrée (JSON, supporte {{ }})" value={data.input ?? {}} onChange={(v) => onChangeData({ input: v })} />
          <JsonField
            label="Politique d'erreur (JSON — stop/retry/ignore/alternative_branch/notify/escalate_director)"
            value={data.onError ?? { kind: "stop" }}
            onChange={(v) => onChangeData({ onError: v })}
            rows={3}
          />
          <label className="block text-xs">
            <span className="mb-1 block font-medium">Action de compensation (optionnel)</span>
            <select
              className="w-full rounded-md border border-p360-lavender-light p-1.5"
              value={(data.compensateActionKey as string) ?? ""}
              disabled={!canManage}
              onChange={(e) => onChangeData({ compensateActionKey: e.target.value || undefined })}
            >
              <option value="">(aucune)</option>
              {registry.actions.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      {node.type === "loop" && (
        <>
          <JsonField
            label='Collection (Expr JSON, ex. { "kind": "var", "path": "context.items" })'
            value={data.collectionExpr}
            onChange={(v) => onChangeData({ collectionExpr: v })}
            rows={3}
          />
          <label className="block text-xs">
            <span className="mb-1 block font-medium">Nom de la variable d&apos;itération</span>
            <input
              className="w-full rounded-md border border-p360-lavender-light p-1.5"
              value={(data.itemVar as string) ?? ""}
              disabled={!canManage}
              onChange={(e) => onChangeData({ itemVar: e.target.value })}
            />
          </label>
          <div className="text-xs">
            <span className="mb-1 block font-medium">Noeuds du corps de boucle</span>
            <div className="max-h-32 space-y-1 overflow-y-auto rounded border border-p360-lavender-light p-2">
              {allNodes
                .filter((n) => n.id !== node.id)
                .map((n) => {
                  const bodyIds = (data.bodyNodeIds as string[]) ?? [];
                  const checked = bodyIds.includes(n.id);
                  return (
                    <label key={n.id} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!canManage}
                        onChange={(e) =>
                          onChangeData({
                            bodyNodeIds: e.target.checked ? [...bodyIds, n.id] : bodyIds.filter((id) => id !== n.id),
                          })
                        }
                      />
                      {n.id} ({n.type})
                    </label>
                  );
                })}
            </div>
          </div>
        </>
      )}

      {node.type === "wait" && (
        <label className="block text-xs">
          <span className="mb-1 block font-medium">Délai (millisecondes)</span>
          <input
            type="number"
            className="w-full rounded-md border border-p360-lavender-light p-1.5"
            value={(data.delayMs as number) ?? 0}
            disabled={!canManage}
            onChange={(e) => onChangeData({ delayMs: Number(e.target.value) })}
          />
        </label>
      )}

      {node.type === "subworkflow" && (
        <label className="block text-xs">
          <span className="mb-1 block font-medium">Clé du workflow cible</span>
          <input
            className="w-full rounded-md border border-p360-lavender-light p-1.5"
            value={(data.workflowKey as string) ?? ""}
            disabled={!canManage}
            onChange={(e) => onChangeData({ workflowKey: e.target.value })}
          />
        </label>
      )}

      {canManage && (
        <Button variant="danger" onClick={onDelete}>
          Supprimer le noeud
        </Button>
      )}
    </div>
  );
}
