import Link from "next/link";
import { requireWorkspaceActor } from "@/lib/workspace-context";
import { getOrgStats, defaultStatsRange } from "@/lib/stats";
import { StatTile } from "@/components/stat-tile";
import { PipelineBarChart } from "@/components/pipeline-bar-chart";
import { ProcessSequencesButton } from "@/components/process-sequences-button";
import { DiscoverAutorunButton } from "@/components/discover-autorun-button";
import { prisma } from "@/lib/prisma";
import { getUnifiedOverview } from "@/lib/dashboards/unified-overview-service";

function formatEuros(cents: number) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}
function formatPercent(v: number) {
  return `${Math.round(v * 100)} %`;
}

export default async function DashboardPage() {
  const actor = await requireWorkspaceActor();
  const { from, to } = defaultStatsRange();
  const [stats, overview] = await Promise.all([getOrgStats(actor.organization.id, from, to), getUnifiedOverview(actor)]);

  const pendingValidations = await prisma.message.count({
    where: { lead: { organizationId: actor.organization.id }, status: "PENDING_VALIDATION" },
  });
  const openTasks = await prisma.task.count({
    where: { organizationId: actor.organization.id, status: "OPEN", assigneeId: actor.user.id },
  });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-p360-ink">Tableau de bord</h1>
          <p className="text-p360-muted text-sm mt-1">90 derniers jours — {actor.organization.name}</p>
        </div>
        <div className="flex gap-2">
          <DiscoverAutorunButton />
          <ProcessSequencesButton />
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-semibold text-p360-ink mb-4">Vue d&apos;ensemble Autorun</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Link href="/workflows" className="rounded-lg border border-p360-lavender-light p-3 hover:bg-p360-sand-light">
            <p className="text-xs text-p360-muted">Workflows</p>
            <p className="text-lg font-semibold text-p360-ink">{overview.workflows.active} actif(s)</p>
            <p className="text-xs text-p360-muted">{overview.workflows.recentRuns} exécution(s) récente(s)</p>
          </Link>
          <Link href="/agents" className="rounded-lg border border-p360-lavender-light p-3 hover:bg-p360-sand-light">
            <p className="text-xs text-p360-muted">Agents IA</p>
            <p className="text-lg font-semibold text-p360-ink">{overview.agents.custom}</p>
          </Link>
          <Link href="/automations" className="rounded-lg border border-p360-lavender-light p-3 hover:bg-p360-sand-light">
            <p className="text-xs text-p360-muted">Automatisations</p>
            <p className="text-lg font-semibold text-p360-ink">{overview.automations.active} actif(s)</p>
            <p className="text-xs text-p360-muted">{overview.automations.recentRuns} exécution(s) récente(s)</p>
          </Link>
          <Link href="/settings/knowledge" className="rounded-lg border border-p360-lavender-light p-3 hover:bg-p360-sand-light">
            <p className="text-xs text-p360-muted">Mémoire</p>
            <p className="text-lg font-semibold text-p360-ink">{overview.memory.entries} entrée(s)</p>
          </Link>
          <Link href="/connectors" className="rounded-lg border border-p360-lavender-light p-3 hover:bg-p360-sand-light">
            <p className="text-xs text-p360-muted">Connecteurs</p>
            <p className="text-lg font-semibold text-p360-ink">
              {overview.connectors.connected}/{overview.connectors.total} connecté(s)
            </p>
          </Link>
          <Link href="/settings/metrics" className="rounded-lg border border-p360-lavender-light p-3 hover:bg-p360-sand-light">
            <p className="text-xs text-p360-muted">Coûts IA (mois)</p>
            <p className="text-lg font-semibold text-p360-ink">{overview.aiCost.totalCostUsd.toFixed(2)} $</p>
            <p className="text-xs text-p360-muted">{overview.aiCost.requestCount} requête(s)</p>
          </Link>
          <Link href="/settings/metrics" className="rounded-lg border border-p360-lavender-light p-3 hover:bg-p360-sand-light">
            <p className="text-xs text-p360-muted">Erreurs API</p>
            <p className="text-lg font-semibold text-p360-ink">{overview.errors.errorCount}</p>
            <p className="text-xs text-p360-muted">
              {overview.errors.errorRate !== null ? `${Math.round(overview.errors.errorRate * 100)} %` : "—"}
            </p>
          </Link>
          <div className="rounded-lg border border-p360-lavender-light p-3">
            <p className="text-xs text-p360-muted">Notifications</p>
            <p className="text-lg font-semibold text-p360-ink">{overview.notifications.unread} non lue(s)</p>
          </div>
        </div>
      </div>

      {(pendingValidations > 0 || openTasks > 0) && (
        <div className="flex gap-3 flex-wrap">
          {pendingValidations > 0 && (
            <Link href="/leads?stage=MESSAGE_TO_VALIDATE" className="badge bg-p360-sand-light text-p360-warning border border-p360-sand">
              {pendingValidations} message(s) en attente de validation
            </Link>
          )}
          {openTasks > 0 && (
            <Link href="/tasks?mine=true" className="badge bg-p360-lavender-light text-p360-blue">
              {openTasks} tâche(s) à traiter
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatTile label="Nouveaux prospects" value={String(stats.kpis.newLeads)} />
        <StatTile label="Prospects qualifiés" value={String(stats.kpis.qualifiedLeads)} />
        <StatTile label="Messages envoyés" value={String(stats.kpis.contactedLeads)} />
        <StatTile label="Réponses reçues" value={String(stats.kpis.repliedConversations)} />
        <StatTile label="Réponses positives" value={String(stats.kpis.positiveReplies)} />
        <StatTile label="Rendez-vous obtenus" value={String(stats.kpis.appointments)} />
        <StatTile label="Devis envoyés" value={String(stats.kpis.quotesSent)} />
        <StatTile label="Clients gagnés" value={String(stats.kpis.customersWon)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatTile label="Chiffre d'affaires généré" value={formatEuros(stats.kpis.revenueGenerated)} />
        <StatTile label="Taux de réponse" value={formatPercent(stats.kpis.responseRate)} sub="réponses / messages envoyés" />
        <StatTile label="Taux de conversion" value={formatPercent(stats.kpis.conversionRate)} sub="clients / nouveaux prospects" />
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-semibold text-p360-ink mb-4">Répartition du pipeline</h2>
        <PipelineBarChart data={stats.pipeline} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-p360-ink mb-3">Par ville</h2>
          <ul className="space-y-1 text-sm">
            {stats.breakdown.byCity.slice(0, 8).map((c) => (
              <li key={c.city} className="flex justify-between text-p360-ink">
                <span>{c.city}</span>
                <span className="tabular-nums text-p360-muted">{c.count}</span>
              </li>
            ))}
            {stats.breakdown.byCity.length === 0 && <li className="text-p360-muted">Aucune donnée.</li>}
          </ul>
        </div>
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-p360-ink mb-3">Par catégorie</h2>
          <ul className="space-y-1 text-sm">
            {stats.breakdown.byCategory.map((c) => (
              <li key={c.category} className="flex justify-between text-p360-ink">
                <span>{c.category}</span>
                <span className="tabular-nums text-p360-muted">{c.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex gap-3">
        <Link href="/leads/import" className="btn-primary">Importer des prospects</Link>
        <Link href="/leads/new" className="btn-secondary">Ajouter un prospect</Link>
        <Link href="/stats" className="btn-secondary">Voir toutes les statistiques</Link>
      </div>
    </div>
  );
}
