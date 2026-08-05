"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api-client";
import { formatEuros } from "@/lib/compta/money";

const BILLS = [500, 200, 100, 50, 20, 10, 5];
const COINS = [2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01];

export function ComptaCashForm({ suggestedTheoretical }: { suggestedTheoretical: number }) {
  const router = useRouter();
  const [theoreticalAmount, setTheoreticalAmount] = useState(String(suggestedTheoretical / 100));
  const [bills, setBills] = useState<Record<number, string>>({});
  const [coins, setCoins] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const countedAmount = useMemo(() => {
    const billsTotal = BILLS.reduce((sum, v) => sum + v * 100 * (Number(bills[v]) || 0), 0);
    const coinsTotal = COINS.reduce((sum, v) => sum + Math.round(v * 100) * (Number(coins[v]) || 0), 0);
    return billsTotal + coinsTotal;
  }, [bills, coins]);

  const theoretical = Math.round(Number(theoreticalAmount) * 100) || 0;
  const difference = countedAmount - theoretical;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/compta/cash-counts", {
        theoreticalAmount: theoretical,
        denominations: {
          bills: Object.fromEntries(BILLS.map((v) => [String(v), Number(bills[v]) || 0])),
          coins: Object.fromEntries(COINS.map((v) => [String(v), Number(coins[v]) || 0])),
        },
        notes: notes || undefined,
      });
      setBills({});
      setCoins({});
      setNotes("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card p-4 space-y-4">
      <div className="max-w-xs">
        <label className="label">Caisse théorique (€)</label>
        <input type="number" step="0.01" min="0" className="input" value={theoreticalAmount} onChange={(e) => setTheoreticalAmount(e.target.value)} />
      </div>

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

      <div>
        <label className="label">Notes (optionnel)</label>
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="flex items-center justify-between border-t border-p360-lavender-light pt-3">
        <div className="text-sm">
          <div>Compté : <span className="font-medium tabular-nums">{formatEuros(countedAmount)}</span></div>
          <div className={difference === 0 ? "text-p360-success" : "text-p360-danger"}>
            Écart : <span className="font-medium tabular-nums">{difference > 0 ? "+" : ""}{formatEuros(difference)}</span>
          </div>
        </div>
        <button type="submit" disabled={busy} className="btn-primary">{busy ? "Enregistrement…" : "Enregistrer le comptage"}</button>
      </div>
      {error && <p className="text-sm text-p360-danger">{error}</p>}
    </form>
  );
}
