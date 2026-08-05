import Link from "next/link";
import { requireWorkspaceActor } from "@/lib/workspace-context";
import { hasWorkspacePermission } from "@/lib/workspace-permissions";
import { listAutomationsForWorkspace } from "@/lib/automation/registry/automation-service";
import { getAutomationDashboard } from "@/lib/automation/dashboard-service";
import { computeOrganizationUsage } from "@/lib/billing/usage-service";
import { AutomationsListClient } from "@/components/automations-list-client";

function quotaLine(label: string, dim: { used: number; limit: number | null; status: string }) {
  const color = dim.status === "blocked" ? "text-p360-danger" : dim.status === "warning" ? "text-p360-warning" : "text-p360-muted";
  return (
    <div key={label} className={`flex justify-between ${color}`}>
      <span>{label}</span>
      <span>
        {dim.used}
        {dim.limit !== null ? ` / ${dim.limit}` : " (illimité)"}
      </span>
    </div>
  );
}

export default async function AutomationsPage() {
  const actor = await requireWorkspaceActor();

  if (!hasWorkspacePermission(actor.workspace.role, "VIEW_WORKSPACE")) {
    return (
      <div className="max-w-3xl">
        <p className="text-sm text-p360-danger">Vous n&apos;avez pas la permission de consulter les automatisations.</p>
      </div>
    );
  }

  const [allAutomations, dashboard, usage] = await Promise.all([
    listAutomationsForWorkspace(actor.workspace.id, { includeTemplates: true }),
    getAutomationDashboard(actor.workspace.id),
    computeOrganizationUsage(actor.organization.id),
  ]);

  const automations = allAutomations.filter((a) => !a.isTemplate);
  const templates = allAutomations.filter((a) => a.isTemplate);
  const canManage = hasWorkspacePermission(actor.workspace.role, "MANAGE_AUTOMATIONS");

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-p360-ink">⚡ Automatisations</h1>
        <p className="mt-1 text-sm text-p360-muted">
          Le noyau d&apos;automatisation Enterprise d&apos;Autorun : chaque noeud d&apos;action s&apos;exécute comme un job
          durable (retryable, verrouillable, priorisé) — voir aussi le moteur de{" "}
          <Link href="/workflows" className="text-p360-blue underline">
            Workflows
          </Link>{" "}
          pour l&apos;orchestration en mémoire plus simple.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-p360-ink mb-3">Consommation du mois (vs plan)</h2>
          <div className="space-y-1 text-sm">
            {quotaLine("Membres", usage.members)}
            {quotaLine("Exécutions d'automatisation (30j)", usage.automationRuns)}
            {quotaLine("Stockage (Mo)", usage.storageMb)}
            {quotaLine("Connecteurs", usage.connectors)}
          </div>
        </div>
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-p360-ink mb-3">Raccourcis</h2>
          <div className="flex flex-wrap gap-2">
            <Link href="/leads/new" className="btn-secondary text-sm">
              Nouveau prospect
            </Link>
            <Link href="/workflows" className="btn-secondary text-sm">
              Workflows
            </Link>
            <Link href="/automations/dlq" className="btn-secondary text-sm">
              File d&apos;attente en échec
            </Link>
            <Link href="/settings/billing" className="btn-secondary text-sm">
              Facturation
            </Link>
            <Link href="/users" className="btn-secondary text-sm">
              Utilisateurs
            </Link>
          </div>
        </div>
      </div>

      <AutomationsListClient
        automations={automations.map((a) => ({
          id: a.id,
          key: a.key,
          name: a.name,
          description: a.description,
          category: a.category,
          status: a.status,
          isTemplate: a.isTemplate,
          updatedAt: a.updatedAt.toISOString(),
        }))}
        templates={templates.map((a) => ({
          id: a.id,
          key: a.key,
          name: a.name,
          description: a.description,
          category: a.category,
          status: a.status,
          isTemplate: a.isTemplate,
          updatedAt: a.updatedAt.toISOString(),
        }))}
        dashboard={dashboard}
        canManage={canManage}
      />
    </div>
  );
}
