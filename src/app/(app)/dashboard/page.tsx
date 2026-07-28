import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { getOrgStats, defaultStatsRange } from "@/lib/stats";
import { StatTile } from "@/components/stat-tile";
import { PipelineBarChart } from "@/components/pipeline-bar-chart";
import { ProcessSequencesButton } from "@/components/process-sequences-button";
import { prisma } from "@/lib/prisma";

function formatEuros(cents: number) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}
function formatPercent(v: number) {
  return `${Math.round(v * 100)} %`;
}

export default async function DashboardPage() {
  const actor = await requireActor();
  const { from, to } = defaultStatsRange();
  const stats = await getOrgStats(actor.organization.id, from, to);

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
        <ProcessSequencesButton />
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
