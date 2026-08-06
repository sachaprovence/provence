"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api-client";
import { formatEuros } from "@/lib/compta/money";

const BILLS = [500, 200, 100, 50, 20, 10, 5];
const COINS = [2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01];

const PAYMENT_LABEL: Record<string, string> = {
  CASH: "Espèces",
  CARD: "Carte",
  TRANSFER: "Virement",
  MEAL_VOUCHER: "Ticket restaurant",
  CHEQUE: "Chèque",
  OTHER: "Autre",
};

type OpenSession = { id: string; openedAt: string | Date; openingFloat: number; notes: string | null } | null;
type Session = {
  id: string;
  openedAt: string | Date;
  closedAt: string | Date | null;
  openingFloat: number;
  closingCountedAmount: number | null;
  theoreticalAmount: number | null;
  differenceAmount: number | null;
};

export function ComptaCashSessionClient({
  openSession,
  breakdown,
  sessions,
}: {
  openSession: OpenSession;
  breakdown: Record<string, number> | null;
  sessions: Session[];
}) {
  const router = useRouter();
  const [openingFloat, setOpeningFloat] = useState("0");
  const [closing, setClosing] = useState(false);
  const [bills, setBills] = useState<Record<number, string>>({});
  const [coins, setCoins] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const countedAmount = useMemo(() => {
    const billsTotal = BILLS.reduce((sum, v) => sum + v * 100 * (Number(bills[v]) || 0), 0);
    const coinsTotal = COINS.reduce((sum, v) => sum + Math.round(v * 100) * (Number(coins[v]) || 0), 0);
    return billsTotal + coinsTotal;
  }, [bills, coins]);

  async function open(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/compta/cash-sessions", { openingFloat: Math.round(Number(openingFloat) * 100) });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    if (!openSession) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/compta/cash-sessions/${openSession.id}/close`, {
        denominations: {
          bills: Object.fromEntries(BILLS.map((v) => [String(v), Number(bills[v]) || 0])),
          coins: Object.fromEntries(COINS.map((v) => [String(v), Number(coins[v]) || 0])),
        },
      });
      setClosing(false);
      setBills({});
      setCoins({});
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {!openSession ? (
        <form onSubmit={open} className="card p-4 space-y-3 max-w-sm">
          <h2 className="text-sm font-semibold text-p360-ink">Aucune session ouverte</h2>
          <div>
            <label className="label">Fond de caisse (€)</label>
            <input type="number" min="0" step="0.01" className="input" value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} />
          </div>
          {error && <p className="text-sm text-p360-danger">{error}</p>}
          <button type="submit" disabled={busy} className="btn-primary">{busy ? "Ouverture…" : "Ouvrir la caisse"}</button>
        </form>
      ) : (
        <div className="card p-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-sm font-semibold text-p360-ink">Session en cours</h2>
              <p className="text-xs text-p360-muted">
                Ouverte le {new Date(openSession.openedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })} — fond de caisse {formatEuros(openSession.openingFloat)}
              </p>
            </div>
            {!closing && (
              <button className="btn-secondary" onClick={() => setClosing(true)}>Fermer la caisse</button>
            )}
          </div>

          {breakdown && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Object.entries(breakdown).map(([method, amount]) => (
                <div key={method} className="rounded-lg border border-p360-lavender-light px-3 py-2">
                  <div className="text-xs text-p360-muted">{PAYMENT_LABEL[method] ?? method}</div>
                  <div className="text-sm font-medium text-p360-ink tabular-nums">{formatEuros(amount)}</div>
                </div>
              ))}
            </div>
          )}

          {closing && (
            <div className="border-t border-p360-lavender-light pt-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-semibold text-p360-ink mb-2">Billets</h3>
                  <div className="space-y-1">
                    {BILLS.map((v) => (
                      <div key={v} className="flex items-center gap-2">
                        <span className="w-16 text-sm text-p360-muted">{v} €</span>
                        <input type="number" min="0" className="input" value={bills[v] ?? ""} onChange={(e) => setBills((b) => ({ ...b, [v]: e.target.value }))} />
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-p360-ink mb-2">Pièces</h3>
                  <div className="space-y-1">
                    {COINS.map((v) => (
                      <div key={v} className="flex items-center gap-2">
                        <span className="w-16 text-sm text-p360-muted">{v} €</span>
                        <input type="number" min="0" className="input" value={coins[v] ?? ""} onChange={(e) => setCoins((c) => ({ ...c, [v]: e.target.value }))} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-p360-lavender-light pt-3">
                <div className="text-sm">
                  Compté : <span className="font-medium tabular-nums">{formatEuros(countedAmount)}</span>
                  {breakdown && (
                    <span className="text-p360-muted"> · Théorique estimé : {formatEuros(openSession.openingFloat + breakdown.CASH)}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button className="btn-secondary" onClick={() => setClosing(false)}>Annuler</button>
                  <button className="btn-primary" disabled={busy} onClick={close}>{busy ? "Fermeture…" : "Confirmer la fermeture"}</button>
                </div>
              </div>
            </div>
          )}
          {error && <p className="text-sm text-p360-danger">{error}</p>}
        </div>
      )}

      <div className="card overflow-x-auto">
        <h2 className="text-sm font-semibold text-p360-ink p-4 pb-0">Journal de caisse</h2>
        <table className="w-full text-sm mt-2">
          <thead className="bg-p360-lavender-light/40 text-p360-muted text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Ouverture</th>
              <th className="text-left px-4 py-2">Fermeture</th>
              <th className="text-left px-4 py-2">Fond de caisse</th>
              <th className="text-left px-4 py-2">Théorique</th>
              <th className="text-left px-4 py-2">Compté</th>
              <th className="text-left px-4 py-2">Écart</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.id} className="border-t border-p360-lavender-light">
                <td className="px-4 py-2 text-p360-muted">{new Date(session.openedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</td>
                <td className="px-4 py-2 text-p360-muted">
                  {session.closedAt ? new Date(session.closedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "En cours"}
                </td>
                <td className="px-4 py-2 tabular-nums">{formatEuros(session.openingFloat)}</td>
                <td className="px-4 py-2 tabular-nums">{session.theoreticalAmount !== null ? formatEuros(session.theoreticalAmount) : "—"}</td>
                <td className="px-4 py-2 tabular-nums">{session.closingCountedAmount !== null ? formatEuros(session.closingCountedAmount) : "—"}</td>
                <td className={`px-4 py-2 tabular-nums font-medium ${session.differenceAmount ? "text-p360-danger" : "text-p360-success"}`}>
                  {session.differenceAmount === null ? "—" : `${session.differenceAmount > 0 ? "+" : ""}${formatEuros(session.differenceAmount)}`}
                </td>
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-p360-muted">Aucune session de caisse enregistrée.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
