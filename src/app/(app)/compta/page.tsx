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
  OTHER: "Autre",
};

export default async function ComptaDashboardPage() {
  const actor = await requireActor();
  const dashboard = await getComptaDashboard(actor.organization.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-p360-ink">Compta Vellano</h1>
        <p className="text-p360-muted text-sm mt-1">{actor.organization.name} — vue du jour</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatTile label="CA du jour" value={formatEuros(dashboard.caToday)} />
        <StatTile label="CA du mois" value={formatEuros(dashboard.caMonth)} />
        <StatTile label="Dépenses du mois" value={formatEuros(dashboard.expensesMonth)} />
        <StatTile label="Bénéfice estimé (HT)" value={formatEuros(dashboard.profitEstimate)} />
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
        <Link href="/compta/caisse" className="btn-secondary">Compter la caisse</Link>
      </div>
    </div>
  );
}
