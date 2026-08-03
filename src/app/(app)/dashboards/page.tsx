import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { StatTile } from "@/components/stat-tile";
import { VIRTUAL_TOUR_STATUS_LABEL, CATEGORY_LABEL } from "@/lib/labels";
import {
  getProductionDashboard,
  getClientsDashboard,
  getVisitsDashboard,
  getAppointmentsDashboard,
  getAiActivityDashboard,
  getPerformanceDashboard,
} from "@/lib/dashboards/dashboard-service";

function formatEuros(cents: number) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

const MISSION_STATUS_LABEL: Record<string, string> = {
  PROPOSED: "Proposée",
  ACCEPTED: "Acceptée",
  DECLINED: "Refusée",
  IN_PROGRESS: "En cours",
  DELIVERED: "Livrée",
  CANCELLED: "Annulée",
};

const APPOINTMENT_STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Planifié",
  COMPLETED: "Terminé",
  CANCELLED: "Annulé",
  NO_SHOW: "Absence",
};

export default async function DashboardsPage() {
  const actor = await requireActor();
  const organizationId = actor.organization.id;

  const [production, clients, visits, appointments, ai, performance] = await Promise.all([
    getProductionDashboard(organizationId),
    getClientsDashboard(organizationId),
    getVisitsDashboard(organizationId),
    getAppointmentsDashboard(organizationId),
    getAiActivityDashboard(organizationId),
    getPerformanceDashboard(organizationId),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-p360-ink">Tableaux de bord</h1>
          <p className="text-p360-muted text-sm mt-1">Production, Clients, Visites, Rendez-vous, Activité IA, Performance</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard" className="btn-secondary text-xs">Commercial &amp; CA</Link>
          <Link href="/automations" className="btn-secondary text-xs">Automatisations</Link>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-p360-ink">Production</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatTile label="Délai moyen de livraison" value={`${production.avgTurnaroundDays} j`} />
          {production.byStatus.map((s) => (
            <StatTile key={s.status} label={MISSION_STATUS_LABEL[s.status] ?? s.status} value={String(s.count)} />
          ))}
        </div>
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-p360-ink mb-3">Charge par prestataire</h3>
          <ul className="space-y-1 text-sm">
            {production.providers.map((p) => (
              <li key={p.id} className="flex justify-between text-p360-ink">
                <span>{p.name}</span>
                <span className="tabular-nums text-p360-muted">{p.missionsCount} mission(s)</span>
              </li>
            ))}
            {production.providers.length === 0 && <li className="text-p360-muted">Aucun prestataire actif.</li>}
          </ul>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-p360-ink">Clients</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatTile label="Clients actifs" value={String(clients.totalCustomers)} />
          <StatTile label="Nouveaux (30j)" value={String(clients.newCustomersLast30Days)} />
          <StatTile label="Valeur vie cumulée" value={formatEuros(clients.totalLifetimeValue)} />
          <StatTile label="Valeur vie moyenne" value={formatEuros(clients.averageLifetimeValue)} />
        </div>
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-p360-ink mb-3">Meilleurs clients</h3>
          <ul className="space-y-1 text-sm">
            {clients.topCustomers.map((c) => (
              <li key={c.id} className="flex justify-between text-p360-ink">
                <span>{c.establishmentName} <span className="text-p360-muted text-xs">({CATEGORY_LABEL[c.category] ?? c.category})</span></span>
                <span className="tabular-nums text-p360-muted">{formatEuros(c.lifetimeValue)}</span>
              </li>
            ))}
            {clients.topCustomers.length === 0 && <li className="text-p360-muted">Aucun client.</li>}
          </ul>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-p360-ink">Visites 3D</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatTile label="Total" value={String(visits.total)} />
          <StatTile label="Taux de publication" value={`${visits.publishedRate} %`} />
          <StatTile label="Surface moyenne" value={`${visits.averageSurfaceM2} m²`} />
          {visits.byStatus.map((s) => (
            <StatTile key={s.status} label={VIRTUAL_TOUR_STATUS_LABEL[s.status] ?? s.status} value={String(s.count)} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-p360-ink">Rendez-vous</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatTile label="À venir" value={String(appointments.upcomingCount)} />
          <StatTile label="Taux de réalisation" value={`${appointments.completionRate} %`} />
          <StatTile label="Taux d'absence" value={`${appointments.noShowRate} %`} />
          {appointments.byStatus.map((s) => (
            <StatTile key={s.status} label={APPOINTMENT_STATUS_LABEL[s.status] ?? s.status} value={String(s.count)} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-p360-ink">Activité IA</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatTile label="Requêtes totales" value={String(ai.totalRequests)} />
          <StatTile label="Coût estimé" value={`$${ai.totalEstimatedCostUsd.toFixed(2)}`} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-p360-ink mb-3">Par fournisseur</h3>
            <ul className="space-y-1 text-sm">
              {ai.byProvider.map((p) => (
                <li key={p.provider} className="flex justify-between text-p360-ink">
                  <span>{p.provider}</span>
                  <span className="tabular-nums text-p360-muted">{p.count} — ${p.estimatedCostUsd.toFixed(2)}</span>
                </li>
              ))}
              {ai.byProvider.length === 0 && <li className="text-p360-muted">Aucune requête IA.</li>}
            </ul>
          </div>
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-p360-ink mb-3">Dernières erreurs</h3>
            <ul className="space-y-1 text-sm">
              {ai.recentErrors.map((e) => (
                <li key={e.id} className="flex justify-between text-p360-danger">
                  <span>{e.kind} ({e.provider})</span>
                  <span className="text-xs text-p360-muted">{new Date(e.createdAt).toLocaleString("fr-FR")}</span>
                </li>
              ))}
              {ai.recentErrors.length === 0 && <li className="text-p360-muted">Aucune erreur récente.</li>}
            </ul>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-p360-ink">Performance de l&apos;équipe</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-p360-lavender-light/40 text-p360-muted text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2">Membre</th>
                <th className="text-left px-4 py-2">Prospects assignés</th>
                <th className="text-left px-4 py-2">Rendez-vous</th>
                <th className="text-left px-4 py-2">Devis envoyés</th>
                <th className="text-left px-4 py-2">Devis gagnés</th>
              </tr>
            </thead>
            <tbody>
              {performance.performance.map((p) => (
                <tr key={p.userId} className="border-t border-p360-lavender-light">
                  <td className="px-4 py-2 text-p360-ink">{p.name}</td>
                  <td className="px-4 py-2 text-p360-muted">{p.leadsAssigned}</td>
                  <td className="px-4 py-2 text-p360-muted">{p.appointmentsOwned}</td>
                  <td className="px-4 py-2 text-p360-muted">{p.quotesSent}</td>
                  <td className="px-4 py-2 text-p360-muted">{p.quotesWon}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
