import { requireRole } from "@/lib/auth";
import { MembershipRole } from "@/generated/prisma/enums";
import { getOrgStats, defaultStatsRange } from "@/lib/stats";
import { prisma } from "@/lib/prisma";
import { StatTile } from "@/components/stat-tile";
import { PipelineBarChart } from "@/components/pipeline-bar-chart";
import { MESSAGE_TYPE_LABEL } from "@/lib/labels";

function formatEuros(cents: number) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}
function formatPercent(v: number) {
  return `${Math.round(v * 100)} %`;
}

type SearchParams = { from?: string; to?: string };

export default async function StatsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requireRole([MembershipRole.OWNER_ADMIN, MembershipRole.SALES]);
  const sp = await searchParams;
  const defaults = defaultStatsRange();
  const from = sp.from ? new Date(sp.from) : defaults.from;
  const to = sp.to ? new Date(sp.to) : defaults.to;

  const stats = await getOrgStats(actor.organization.id, from, to);

  const [campaigns, members, messagesByType] = await Promise.all([
    prisma.campaign.findMany({ where: { organizationId: actor.organization.id }, select: { id: true, name: true } }),
    prisma.membership.findMany({ where: { organizationId: actor.organization.id }, include: { user: true } }),
    prisma.message.groupBy({
      by: ["type"],
      where: { lead: { organizationId: actor.organization.id }, status: "SENT", sentAt: { gte: from, lte: to } },
      _count: { _all: true },
    }),
  ]);

  const campaignNames = new Map(campaigns.map((c) => [c.id, c.name]));
  const userNames = new Map(members.map((m) => [m.userId, `${m.user.firstName} ${m.user.lastName}`]));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold text-p360-ink">Statistiques</h1>
        <form method="get" className="flex gap-2 items-end">
          <div>
            <label className="label">Du</label>
            <input type="date" name="from" className="input" defaultValue={from.toISOString().slice(0, 10)} />
          </div>
          <div>
            <label className="label">Au</label>
            <input type="date" name="to" className="input" defaultValue={to.toISOString().slice(0, 10)} />
          </div>
          <button className="btn-secondary" type="submit">Appliquer</button>
        </form>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatTile label="Nouveaux prospects" value={String(stats.kpis.newLeads)} />
        <StatTile label="Prospects qualifiés" value={String(stats.kpis.qualifiedLeads)} />
        <StatTile label="Réponses reçues" value={String(stats.kpis.repliedConversations)} />
        <StatTile label="Réponses positives" value={String(stats.kpis.positiveReplies)} />
        <StatTile label="Rendez-vous obtenus" value={String(stats.kpis.appointments)} />
        <StatTile label="Devis envoyés" value={String(stats.kpis.quotesSent)} />
        <StatTile label="Clients gagnés" value={String(stats.kpis.customersWon)} />
        <StatTile label="Chiffre d'affaires" value={formatEuros(stats.kpis.revenueGenerated)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatTile label="Taux de réponse" value={formatPercent(stats.kpis.responseRate)} />
        <StatTile label="Taux de rendez-vous" value={formatPercent(stats.kpis.appointmentRate)} sub="RDV / réponses" />
        <StatTile label="Taux de conversion" value={formatPercent(stats.kpis.conversionRate)} sub="clients / prospects" />
        <StatTile label="Valeur moyenne client" value={formatEuros(stats.kpis.avgCustomerValue)} />
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-semibold text-p360-ink mb-4">Pipeline (tous prospects)</h2>
        <PipelineBarChart data={stats.pipeline} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-p360-ink mb-3">Performances par ville</h2>
          <ul className="space-y-1 text-sm">
            {stats.breakdown.byCity.map((c) => (
              <li key={c.city} className="flex justify-between"><span className="text-p360-ink">{c.city}</span><span className="text-p360-muted tabular-nums">{c.count}</span></li>
            ))}
          </ul>
        </div>
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-p360-ink mb-3">Performances par catégorie</h2>
          <ul className="space-y-1 text-sm">
            {stats.breakdown.byCategory.map((c) => (
              <li key={c.category} className="flex justify-between"><span className="text-p360-ink">{c.category}</span><span className="text-p360-muted tabular-nums">{c.count}</span></li>
            ))}
          </ul>
        </div>
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-p360-ink mb-3">Performances par campagne</h2>
          <ul className="space-y-1 text-sm">
            {stats.breakdown.byCampaign.map((c) => (
              <li key={c.campaignId} className="flex justify-between"><span className="text-p360-ink">{campaignNames.get(c.campaignId) ?? c.campaignId}</span><span className="text-p360-muted tabular-nums">{c.count}</span></li>
            ))}
            {stats.breakdown.byCampaign.length === 0 && <li className="text-p360-muted">Aucune donnée.</li>}
          </ul>
        </div>
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-p360-ink mb-3">Performances par commercial</h2>
          <ul className="space-y-1 text-sm">
            {stats.breakdown.byCommercial.map((c) => (
              <li key={c.userId} className="flex justify-between"><span className="text-p360-ink">{userNames.get(c.userId) ?? c.userId}</span><span className="text-p360-muted tabular-nums">{c.count}</span></li>
            ))}
            {stats.breakdown.byCommercial.length === 0 && <li className="text-p360-muted">Aucune donnée.</li>}
          </ul>
        </div>
        <div className="card p-5 md:col-span-2">
          <h2 className="text-sm font-semibold text-p360-ink mb-3">Performances par modèle de message</h2>
          <ul className="grid grid-cols-2 gap-1 text-sm">
            {messagesByType.map((m) => (
              <li key={m.type} className="flex justify-between"><span className="text-p360-ink">{MESSAGE_TYPE_LABEL[m.type] ?? m.type}</span><span className="text-p360-muted tabular-nums">{m._count._all}</span></li>
            ))}
            {messagesByType.length === 0 && <li className="text-p360-muted">Aucune donnée.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
