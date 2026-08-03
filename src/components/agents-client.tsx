"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast-provider";

export type CatalogEntry = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  version: string;
  author: string;
  category: string;
  icon: string | null;
  declaredToolKeys: string[];
  declaredPermissions: string[];
};

export type InstallationRow = {
  id: string;
  status: string;
  grantedToolKeys: string[];
  grantedPermissions: string[];
  definition: { id: string; name: string; icon: string | null; category: string; version: string };
};

const STATUS_VARIANT: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  INSTALLED: "neutral",
  ACTIVE: "success",
  INACTIVE: "neutral",
  SUSPENDED: "warning",
  UNINSTALLED: "danger",
};

const STATUS_LABEL: Record<string, string> = {
  INSTALLED: "Installé",
  ACTIVE: "Actif",
  INACTIVE: "Inactif",
  SUSPENDED: "Suspendu",
  UNINSTALLED: "Désinstallé",
};

export function AgentsClient({ catalog, installations }: { catalog: CatalogEntry[]; installations: InstallationRow[] }) {
  const router = useRouter();
  const { push } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const installedDefinitionIds = new Set(
    installations.filter((i) => i.status !== "UNINSTALLED").map((i) => i.definition.id)
  );

  async function handleInstall(entry: CatalogEntry) {
    setBusyId(entry.id);
    try {
      await apiPost("/api/agents/installations", {
        definitionId: entry.id,
        toolKeys: entry.declaredToolKeys,
        permissions: entry.declaredPermissions,
      });
      router.refresh();
      push({ title: `${entry.name} installé`, variant: "success" });
    } catch (err) {
      push({
        title: "Installation impossible",
        description: err instanceof ApiError ? err.message : "Erreur inattendue.",
        variant: "error",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleLifecycle(installationId: string, action: "activate" | "deactivate" | "suspend" | "resume" | "uninstall") {
    setBusyId(installationId);
    try {
      await apiPost(`/api/agents/installations/${installationId}/${action}`);
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
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-p360-ink">Agents installés</h2>
        {installations.length === 0 ? (
          <EmptyState title="Aucun agent installé" description="Installez un agent depuis le catalogue ci-dessous." />
        ) : (
          <div className="space-y-3">
            {installations.map((installation) => (
              <Card key={installation.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{installation.definition.icon ?? "🤖"}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <Link href={`/settings/agents/${installation.id}`} className="font-medium text-p360-ink hover:underline">
                        {installation.definition.name}
                      </Link>
                      <Badge variant={STATUS_VARIANT[installation.status] ?? "neutral"}>
                        {STATUS_LABEL[installation.status] ?? installation.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-p360-muted">
                      v{installation.definition.version} · {installation.definition.category} ·{" "}
                      {installation.grantedToolKeys.length} outil(s) · {installation.grantedPermissions.length} permission(s)
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {installation.status === "SUSPENDED" && (
                    <Button variant="secondary" loading={busyId === installation.id} onClick={() => handleLifecycle(installation.id, "resume")}>
                      Reprendre
                    </Button>
                  )}
                  {installation.status === "ACTIVE" && (
                    <>
                      <Button variant="secondary" loading={busyId === installation.id} onClick={() => handleLifecycle(installation.id, "suspend")}>
                        Suspendre
                      </Button>
                      <Button variant="secondary" loading={busyId === installation.id} onClick={() => handleLifecycle(installation.id, "deactivate")}>
                        Désactiver
                      </Button>
                    </>
                  )}
                  {(installation.status === "INSTALLED" || installation.status === "INACTIVE") && (
                    <Button variant="primary" loading={busyId === installation.id} onClick={() => handleLifecycle(installation.id, "activate")}>
                      Activer
                    </Button>
                  )}
                  {installation.status !== "UNINSTALLED" && (
                    <Button variant="danger" loading={busyId === installation.id} onClick={() => handleLifecycle(installation.id, "uninstall")}>
                      Désinstaller
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-p360-ink">Catalogue</h2>
        {catalog.length === 0 ? (
          <EmptyState title="Aucun agent au catalogue" />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {catalog.map((entry) => (
              <Card key={entry.id}>
                <CardHeader className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{entry.icon ?? "🤖"}</span>
                    <div>
                      <CardTitle>{entry.name}</CardTitle>
                      <p className="text-xs text-p360-muted">
                        {entry.author} · v{entry.version} · {entry.category}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                {entry.description && <p className="mb-3 text-sm text-p360-muted">{entry.description}</p>}
                <p className="mb-3 text-xs text-p360-muted">
                  Outils déclarés : {entry.declaredToolKeys.join(", ") || "aucun"}
                  <br />
                  Permissions déclarées : {entry.declaredPermissions.join(", ") || "aucune"}
                </p>
                <Button
                  variant="secondary"
                  loading={busyId === entry.id}
                  disabled={installedDefinitionIds.has(entry.id)}
                  onClick={() => handleInstall(entry)}
                >
                  {installedDefinitionIds.has(entry.id) ? "Déjà installé" : "Installer"}
                </Button>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
