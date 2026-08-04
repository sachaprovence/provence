"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiPatch, apiPost, ApiError } from "@/lib/api-client";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type { getInvoice } from "@/lib/crm/invoice-service";

type InvoiceDetail = Awaited<ReturnType<typeof getInvoice>>;

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Brouillon",
  SENT: "Envoyée",
  PAID: "Payée",
  OVERDUE: "En retard",
  CANCELLED: "Annulée",
};

function formatEuros(cents: number) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}
function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("fr-FR");
}

/**
 * Paiements partiels et solde restant dû (v1.1, AR-0169) — `InvoiceStatus`
 * reste l'affichage principal (binaire), mais la fiche montre désormais
 * chaque paiement individuel et calcule le solde en temps réel.
 */
export function InvoiceDetailClient({ invoice }: { invoice: InvoiceDetail }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Virement");
  const [note, setNote] = useState("");

  const paid = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
  const balance = invoice.totalAmount - paid;

  async function setStatus(status: string) {
    setBusy(true);
    setError(null);
    try {
      await apiPatch(`/api/invoices/${invoice.id}`, { status });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  async function recordPayment(e: React.FormEvent) {
    e.preventDefault();
    const cents = Math.round(Number(amount) * 100);
    if (!cents || cents <= 0) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/invoices/${invoice.id}/payments`, { amount: cents, method, note: note || undefined });
      setAmount("");
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/invoices" className="text-sm text-p360-blue hover:underline">
          ← Factures
        </Link>
        <div className="flex items-center gap-2 mt-1">
          <h1 className="text-2xl font-semibold text-p360-ink">{invoice.reference}</h1>
          <span className="badge bg-p360-lavender-light text-p360-blue">{STATUS_LABEL[invoice.status] ?? invoice.status}</span>
        </div>
        <p className="text-sm text-p360-muted mt-1">
          Client : <Link href={`/leads/${invoice.lead.id}`} className="text-p360-blue hover:underline">{invoice.lead.establishmentName}</Link>
          {invoice.dueAt && ` — échéance ${formatDate(invoice.dueAt)}`}
        </p>
      </div>

      {error && <div className="card p-3 text-sm text-p360-danger border-p360-danger">{error}</div>}

      <Card>
        <CardHeader>
          <CardTitle>Lignes</CardTitle>
        </CardHeader>
        <table className="w-full text-sm">
          <thead className="text-p360-muted text-xs uppercase">
            <tr>
              <th className="text-left py-1">Prestation</th>
              <th className="text-right py-1">Quantité</th>
              <th className="text-right py-1">Prix unitaire</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={line.id} className="border-t border-p360-lavender-light">
                <td className="py-1.5 text-p360-ink">{line.label}</td>
                <td className="py-1.5 text-right text-p360-ink">{line.quantity}</td>
                <td className="py-1.5 text-right text-p360-ink">{formatEuros(line.unitPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-p360-lavender-light mt-3 pt-3 text-sm space-y-1 text-right">
          <div className="text-p360-ink font-semibold">Total TTC : {formatEuros(invoice.totalAmount)}</div>
          <div className="text-p360-muted">Payé : {formatEuros(paid)}</div>
          <div className={balance > 0 ? "text-p360-danger font-medium" : "text-p360-success font-medium"}>
            Solde restant dû : {formatEuros(Math.max(balance, 0))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {invoice.status === "DRAFT" && <button className="btn-primary" disabled={busy} onClick={() => setStatus("SENT")}>Envoyer</button>}
          {(invoice.status === "SENT" || invoice.status === "OVERDUE") && (
            <button className="btn-secondary" disabled={busy} onClick={() => setStatus("CANCELLED")}>Annuler</button>
          )}
          <a className="btn-secondary" href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer">Télécharger le PDF</a>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Paiements ({invoice.payments.length})</CardTitle>
        </CardHeader>
        <ul className="space-y-2 mb-4">
          {invoice.payments.map((payment) => (
            <li key={payment.id} className="text-sm border border-p360-lavender-light rounded-lg px-3 py-2 flex items-center justify-between">
              <div>
                <div className="text-p360-ink font-medium">{formatEuros(payment.amount)} — {payment.method}</div>
                {payment.note && <div className="text-xs text-p360-muted">{payment.note}</div>}
              </div>
              <div className="text-xs text-p360-muted">{formatDate(payment.paidAt)}</div>
            </li>
          ))}
          {invoice.payments.length === 0 && <p className="text-sm text-p360-muted">Aucun paiement enregistré.</p>}
        </ul>

        {balance > 0 && invoice.status !== "CANCELLED" && (
          <form onSubmit={recordPayment} className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="label">Montant (€)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={balance / 100}
                className="input w-32"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Moyen de paiement</label>
              <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
                <option>Virement</option>
                <option>Carte bancaire</option>
                <option>Chèque</option>
                <option>Espèces</option>
                <option>Autre</option>
              </select>
            </div>
            <div>
              <label className="label">Note (optionnel)</label>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <button type="submit" className="btn-primary" disabled={busy || !amount}>
              {busy ? "Enregistrement…" : "Enregistrer le paiement"}
            </button>
          </form>
        )}
      </Card>
    </div>
  );
}
