import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { getComptaDashboard } from "@/lib/compta/dashboard-service";
import { StatTile } from "@/components/stat-tile";
import { ComptaSalesChart } from "@/components/compta-sales-chart";
import { formatEuros } from "@/lib/compta/money";

const PAYMENT_LABEL: Record<string, string> = {
  CASH: "Espèces",
  CARD: "Carte",
  TRANSFER: "Virement",
  MEAL_VOUCHER: "Ticket restaurant",
  CHEQUE: "Chèque",
  OTHER: "Autre",
};

export default async function ComptaDashboardPage() {
  const actor = await requireActor();
  const dashboard = await getComptaDashboard(actor.organization.id);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-p360-ink">Compta Vellano</h1>
          <p className="text-p360-muted text-sm mt-1">{actor.organization.name} — vue du jour</p>
        </div>
        <Link href="/compta/rapide" className="btn-primary text-base px-6 py-3">
          ⚡ Vente rapide
        </Link>
      </div>

      {dashboard.alerts.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          {dashboard.alerts.map((alert) => (
            <span key={alert.type} className="badge bg-p360-sand-light text-p360-warning border border-p360-sand">
              ⚠ {alert.message}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatTile label="CA du jour" value={formatEuros(dashboard.caToday)} />
        <StatTile label="CA de la semaine" value={formatEuros(dashboard.caWeek)} />
        <StatTile label="CA du mois" value={formatEuros(dashboard.caMonth)} />
        <StatTile label="Dépenses du mois" value={formatEuros(dashboard.expensesMonth)} />
        <StatTile label="Bénéfice estimé (HT)" value={formatEuros(dashboard.profitEstimate)} />
        <StatTile
          label="Marge (HT)"
          value={dashboard.marginPercent === null ? "—" : `${dashboard.marginPercent.toFixed(0)} %`}
          sub={dashboard.marginPercent === null ? "Aucun coût matière renseigné" : formatEuros(dashboard.marginAmount)}
        />
        <StatTile label="TVA à payer (mois)" value={formatEuros(dashboard.vatDueMonth)} />
        <StatTile
          label="Solde de caisse"
          value={dashboard.cashBalance === null ? "—" : formatEuros(dashboard.cashBalance)}
          sub={dashboard.cashBalance === null ? "Aucun comptage enregistré" : "Dernier comptage"}
        />
        <StatTile label="Solde bancaire" value="—" sub="Module Banque à venir" />
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-semibold text-p360-ink mb-4">CA des 14 derniers jours</h2>
        <ComptaSalesChart data={dashboard.dailySales} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-p360-ink mb-3">Produits les plus vendus (30 jours)</h2>
          <ul className="space-y-1 text-sm">
            {dashboard.topProducts.map((entry) => (
              <li key={entry.product.id} className="flex justify-between text-p360-ink">
                <span>{entry.product.name}</span>
                <span className="tabular-nums text-p360-muted">{entry.quantitySold} vendus</span>
              </li>
            ))}
            {dashboard.topProducts.length === 0 && <li className="text-p360-muted">Aucune donnée.</li>}
          </ul>
        </div>
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-p360-ink mb-3">Catégories les plus vendues (30 jours)</h2>
          <ul className="space-y-1 text-sm">
            {dashboard.topCategories.map((entry) => (
              <li key={entry.category} className="flex justify-between text-p360-ink">
                <span>{entry.category}</span>
                <span className="tabular-nums text-p360-muted">{formatEuros(entry.total)}</span>
              </li>
            ))}
            {dashboard.topCategories.length === 0 && <li className="text-p360-muted">Aucune donnée.</li>}
          </ul>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-semibold text-p360-ink mb-3">Dernières opérations</h2>
        <ul className="divide-y divide-p360-lavender-light">
          {dashboard.lastOperations.map((op) => (
            <li key={`${op.type}-${op.id}`} className="flex items-center justify-between py-2 text-sm">
              <div>
                <span className="text-p360-ink">{op.type === "sale" ? `Vente — ${PAYMENT_LABEL[op.label] ?? op.label}` : op.label}</span>
                <span className="text-p360-muted ml-2">{new Date(op.date).toLocaleDateString("fr-FR")}</span>
              </div>
              <span className={op.amount < 0 ? "text-p360-danger tabular-nums" : "text-p360-success tabular-nums"}>
                {formatEuros(op.amount)}
              </span>
            </li>
          ))}
          {dashboard.lastOperations.length === 0 && <li className="py-4 text-center text-p360-muted text-sm">Aucune opération pour l&apos;instant.</li>}
        </ul>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Link href="/compta/ventes/nouvelle" className="btn-primary">Enregistrer une vente</Link>
        <Link href="/compta/depenses/nouvelle" className="btn-secondary">Ajouter une dépense</Link>
        <Link href="/compta/caisse" className="btn-secondary">Ouvrir/fermer la caisse</Link>
      </div>
    </div>
  );
}
