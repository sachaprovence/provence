"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast-provider";

export type CustomAgentRow = {
  id: string;
  name: string;
  description: string | null;
  providerKey: string;
  model: string | null;
  toolKeys: string[];
  memoryEnabled: boolean;
  createdAt: string;
};

export type AvailableTool = { key: string; name: string; description: string | null; category: string };
export type AvailableProvider = { key: string; defaultModel: string | null };

export function CustomAgentsClient({
  agents,
  tools,
  providers,
  canManage,
}: {
  agents: CustomAgentRow[];
  tools: AvailableTool[];
  providers: AvailableProvider[];
  canManage: boolean;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [providerKey, setProviderKey] = useState(providers[0]?.key ?? "demo");
  const [model, setModel] = useState("");
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());

  const toolsByCategory = tools.reduce<Record<string, AvailableTool[]>>((acc, tool) => {
    (acc[tool.category] ??= []).push(tool);
    return acc;
  }, {});

  function toggleTool(key: string) {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiPost("/api/custom-agents", {
        name,
        description: description || undefined,
        systemPrompt: systemPrompt || undefined,
        providerKey,
        model: model || undefined,
        toolKeys: Array.from(selectedTools),
        memoryEnabled,
      });
      push({ title: "Agent créé", variant: "success" });
      setShowForm(false);
      setName("");
      setDescription("");
      setSystemPrompt("");
      setModel("");
      setSelectedTools(new Set());
      router.refresh();
    } catch (err) {
      push({
        title: "Création impossible",
        description: err instanceof ApiError ? err.message : "Erreur inattendue.",
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <div>
          {!showForm ? (
            <Button onClick={() => setShowForm(true)}>+ Créer un agent</Button>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Nouvel agent</CardTitle>
              </CardHeader>
              <form onSubmit={handleCreate} className="space-y-4 p-4">
                <Input id="custom-agent-name" label="Nom" required value={name} onChange={(e) => setName(e.target.value)} />
                <Textarea
                  id="custom-agent-description"
                  label="Description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />
                <Textarea
                  id="custom-agent-system-prompt"
                  label="Prompt système (personnalité, instructions)"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={4}
                  hint="Ex : « Tu es un assistant qui aide à qualifier des prospects immobiliers, réponds en français, de façon concise. »"
                />
                <div className="grid grid-cols-2 gap-4">
                  <Select
                    id="custom-agent-provider"
                    label="Fournisseur IA"
                    value={providerKey}
                    onChange={(e) => setProviderKey(e.target.value)}
                  >
                    {providers.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.key}
                        {p.defaultModel ? ` (${p.defaultModel})` : ""}
                      </option>
                    ))}
                  </Select>
                  <Input
                    id="custom-agent-model"
                    label="Modèle (optionnel)"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="Modèle par défaut du fournisseur si vide"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-p360-ink">
                  <input type="checkbox" checked={memoryEnabled} onChange={(e) => setMemoryEnabled(e.target.checked)} />
                  Activer la mémoire (l&apos;agent se souvient du résumé des échanges précédents)
                </label>
                <div>
                  <p className="label">Outils autorisés</p>
                  <div className="mt-2 space-y-3 max-h-64 overflow-y-auto rounded border border-p360-border p-3">
                    {Object.entries(toolsByCategory).map(([category, categoryTools]) => (
                      <div key={category}>
                        <p className="text-xs font-semibold uppercase text-p360-muted">{category}</p>
                        <div className="mt-1 space-y-1">
                          {categoryTools.map((tool) => (
                            <label key={tool.key} className="flex items-start gap-2 text-sm text-p360-ink">
                              <input
                                type="checkbox"
                                checked={selectedTools.has(tool.key)}
                                onChange={() => toggleTool(tool.key)}
                                className="mt-1"
                              />
                              <span>
                                <span className="font-medium">{tool.name}</span>
                                {tool.description && <span className="text-p360-muted"> — {tool.description}</span>}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" loading={submitting}>
                    Créer l&apos;agent
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                    Annuler
                  </Button>
                </div>
              </form>
            </Card>
          )}
        </div>
      )}

      {agents.length === 0 ? (
        <EmptyState
          title="Aucun agent personnalisé"
          description={
            canManage
              ? "Créez votre premier agent pour commencer à discuter avec lui."
              : "Aucun agent n'a encore été créé dans ce workspace."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {agents.map((agent) => (
            <Card key={agent.id}>
              <CardHeader>
                <CardTitle>{agent.name}</CardTitle>
              </CardHeader>
              <div className="space-y-2 p-4 pt-0">
                {agent.description && <p className="text-sm text-p360-muted">{agent.description}</p>}
                <div className="flex flex-wrap gap-2">
                  <Badge variant="neutral">{agent.providerKey}</Badge>
                  {agent.model && <Badge variant="neutral">{agent.model}</Badge>}
                  <Badge variant="neutral">{agent.toolKeys.length} outil(s)</Badge>
                  {agent.memoryEnabled && <Badge variant="success">Mémoire active</Badge>}
                </div>
                <Link href={`/agents/${agent.id}`}>
                  <Button className="mt-2 w-full">Discuter</Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
