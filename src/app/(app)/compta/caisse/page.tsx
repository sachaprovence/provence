import { requireActor } from "@/lib/auth";
import { listCashCounts } from "@/lib/compta/cash-service";
import { getOpenSession, getPaymentBreakdown, listCashSessions } from "@/lib/compta/cash-session-service";
import { getComptaDashboard } from "@/lib/compta/dashboard-service";
import { ComptaCashSessionClient } from "@/components/compta-cash-session-client";
import { ComptaCashForm } from "@/components/compta-cash-form";
import { formatEuros } from "@/lib/compta/money";

export default async function ComptaCashPage() {
  const actor = await requireActor();
  const [openSession, sessions, cashCounts, dashboard] = await Promise.all([
    getOpenSession(actor.organization.id),
    listCashSessions(actor.organization.id),
    listCashCounts(actor.organization.id),
    getComptaDashboard(actor.organization.id),
  ]);

  const breakdown = openSession
    ? await getPaymentBreakdown(actor.organization.id, { openedAt: openSession.openedAt, closedAt: null })
    : null;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-p360-ink">Caisse</h1>

      <ComptaCashSessionClient openSession={openSession} breakdown={breakdown} sessions={sessions} />

      <details className="card p-4">
        <summary className="cursor-pointer text-sm font-semibold text-p360-ink">Comptage ponctuel (sans session)</summary>
        <div className="mt-4 space-y-4">
          <ComptaCashForm suggestedTheoretical={dashboard.caToday} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-p360-lavender-light/40 text-p360-muted text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Date</th>
                  <th className="text-left px-4 py-2">Caisse théorique</th>
                  <th className="text-left px-4 py-2">Caisse comptée</th>
                  <th className="text-left px-4 py-2">Écart</th>
                  <th className="text-left px-4 py-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {cashCounts.map((count) => (
                  <tr key={count.id} className="border-t border-p360-lavender-light">
                    <td className="px-4 py-2 text-p360-muted">
                      {new Date(count.countedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="px-4 py-2 tabular-nums">{formatEuros(count.theoreticalAmount)}</td>
                    <td className="px-4 py-2 tabular-nums">{formatEuros(count.countedAmount)}</td>
                    <td className={`px-4 py-2 tabular-nums font-medium ${count.differenceAmount === 0 ? "text-p360-success" : "text-p360-danger"}`}>
                      {count.differenceAmount > 0 ? "+" : ""}
                      {formatEuros(count.differenceAmount)}
                    </td>
                    <td className="px-4 py-2 text-p360-muted">{count.notes ?? "—"}</td>
                  </tr>
                ))}
                {cashCounts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-p360-muted">Aucun comptage enregistré.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </div>
  );
}
