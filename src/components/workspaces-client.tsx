"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast-provider";

export type WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isDefault: boolean;
  archivedAt: string | null;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // diacritiques (accents), après normalisation NFD
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function WorkspacesClient({ workspaces }: { workspaces: WorkspaceRow[] }) {
  const router = useRouter();
  const { push } = useToast();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await apiPost("/api/workspaces", { name, slug: slugify(name) });
      setName("");
      router.refresh();
      push({ title: "Workspace créé", variant: "success" });
    } catch (err) {
      push({
        title: "Création impossible",
        description: err instanceof ApiError ? err.message : "Erreur inattendue.",
        variant: "error",
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleArchiveToggle(workspace: WorkspaceRow) {
    setBusyId(workspace.id);
    try {
      const action = workspace.archivedAt ? "restore" : "archive";
      await apiPost(`/api/workspaces/${workspace.id}/${action}`);
      router.refresh();
    } catch (err) {
      push({
        title: "Action impossible",
        description: err instanceof ApiError ? err.message : "Erreur inattendue.",
        variant: "error",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {workspaces.length === 0 ? (
        <EmptyState title="Aucun workspace" description="Créez le premier workspace de votre organisation." />
      ) : (
        <div className="space-y-3">
          {workspaces.map((workspace) => (
            <Card key={workspace.id} className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-p360-ink">{workspace.name}</span>
                  {workspace.isDefault && <Badge variant="info">Par défaut</Badge>}
                  {workspace.archivedAt && <Badge variant="warning">Archivé</Badge>}
                </div>
                <p className="text-xs text-p360-muted">/{workspace.slug}</p>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/settings/workspaces/${workspace.id}/members`}>
                  <Button variant="secondary">Membres</Button>
                </Link>
                {!workspace.isDefault && (
                  <Button
                    variant={workspace.archivedAt ? "secondary" : "danger"}
                    loading={busyId === workspace.id}
                    onClick={() => handleArchiveToggle(workspace)}
                  >
                    {workspace.archivedAt ? "Restaurer" : "Archiver"}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Créer un workspace</CardTitle>
        </CardHeader>
        <form onSubmit={handleCreate} className="flex items-end gap-3">
          <div className="flex-1">
            <Input label="Nom" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button type="submit" loading={creating}>
            Créer
          </Button>
        </form>
      </Card>
    </div>
  );
}
