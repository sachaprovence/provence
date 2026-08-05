import { requireActor } from "@/lib/auth";
import { getVatSummaryByYear } from "@/lib/compta/vat-service";
import { StatTile } from "@/components/stat-tile";
import { formatEuros } from "@/lib/compta/money";

const MONTH_LABEL = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

export default async function ComptaVatPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const actor = await requireActor();
  const { year: yearParam } = await searchParams;
  const year = yearParam ? Number(yearParam) : new Date().getFullYear();
  const months = await getVatSummaryByYear(actor.organization.id, year);

  const currentMonthIndex = new Date().getMonth();
  const currentMonth = year === new Date().getFullYear() ? months[currentMonthIndex] : null;

  const yearTotals = months.reduce(
    (acc, m) => ({ collected: acc.collected + m.collected, deductible: acc.deductible + m.deductible, due: acc.due + m.due }),
    { collected: 0, deductible: 0, due: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-p360-ink">TVA</h1>
        <div className="flex gap-2 text-sm">
          <a href={`/compta/tva?year=${year - 1}`} className="btn-secondary">{year - 1}</a>
          <span className="px-3 py-2 font-medium text-p360-ink">{year}</span>
          <a href={`/compta/tva?year=${year + 1}`} className="btn-secondary">{year + 1}</a>
        </div>
      </div>

      {currentMonth && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatTile label={`TVA collectée — ${MONTH_LABEL[currentMonthIndex]}`} value={formatEuros(currentMonth.collected)} />
          <StatTile label={`TVA déductible — ${MONTH_LABEL[currentMonthIndex]}`} value={formatEuros(currentMonth.deductible)} />
          <StatTile label="TVA à payer (mois en cours)" value={formatEuros(currentMonth.due)} />
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-p360-lavender-light/40 text-p360-muted text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Mois</th>
              <th className="text-left px-4 py-2">TVA collectée</th>
              <th className="text-left px-4 py-2">TVA déductible</th>
              <th className="text-left px-4 py-2">TVA à payer</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m, index) => (
              <tr key={index} className="border-t border-p360-lavender-light">
                <td className="px-4 py-2 text-p360-ink">{MONTH_LABEL[index]}</td>
                <td className="px-4 py-2 tabular-nums">{formatEuros(m.collected)}</td>
                <td className="px-4 py-2 tabular-nums">{formatEuros(m.deductible)}</td>
                <td className="px-4 py-2 tabular-nums font-medium">{formatEuros(m.due)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-p360-lavender-light font-semibold">
              <td className="px-4 py-2 text-p360-ink">Total {year}</td>
              <td className="px-4 py-2 tabular-nums">{formatEuros(yearTotals.collected)}</td>
              <td className="px-4 py-2 tabular-nums">{formatEuros(yearTotals.deductible)}</td>
              <td className="px-4 py-2 tabular-nums">{formatEuros(yearTotals.due)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
