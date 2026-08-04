"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPatch, ApiError } from "@/lib/api-client";

type Invoice = {
  id: string;
  reference: string;
  status: string;
  totalAmount: number;
  dueAt: string | Date | null;
  lead: { id: string; establishmentName: string };
};

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

export function InvoicesClient({ invoices }: { invoices: Invoice[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(id: string, status: string) {
    setBusy(id);
    setError(null);
    try {
      await apiPatch(`/api/invoices/${id}`, { status });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card overflow-x-auto">
      {error && <div className="p-3 text-sm text-p360-danger">{error}</div>}
      <table className="w-full text-sm">
        <thead className="bg-p360-lavender-light/40 text-p360-muted text-xs uppercase">
          <tr>
            <th className="text-left px-4 py-2">Référence</th>
            <th className="text-left px-4 py-2">Client</th>
            <th className="text-left px-4 py-2">Montant TTC</th>
            <th className="text-left px-4 py-2">Échéance</th>
            <th className="text-left px-4 py-2">Statut</th>
            <th className="text-left px-4 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr key={invoice.id} className="border-t border-p360-lavender-light">
              <td className="px-4 py-2">
                <Link href={`/invoices/${invoice.id}`} className="text-p360-blue hover:underline">{invoice.reference}</Link>
              </td>
              <td className="px-4 py-2"><Link href={`/leads/${invoice.lead.id}`} className="text-p360-blue hover:underline">{invoice.lead.establishmentName}</Link></td>
              <td className="px-4 py-2 text-p360-ink">{formatEuros(invoice.totalAmount)}</td>
              <td className="px-4 py-2 text-p360-muted">{invoice.dueAt ? new Date(invoice.dueAt).toLocaleDateString("fr-FR") : "—"}</td>
              <td className="px-4 py-2"><span className="badge bg-p360-lavender-light text-p360-blue">{STATUS_LABEL[invoice.status]}</span></td>
              <td className="px-4 py-2 space-x-2">
                {invoice.status === "DRAFT" && <button className="text-xs text-p360-blue hover:underline" disabled={busy === invoice.id} onClick={() => setStatus(invoice.id, "SENT")}>Envoyer</button>}
                {invoice.status === "SENT" && <button className="text-xs text-p360-success hover:underline" disabled={busy === invoice.id} onClick={() => setStatus(invoice.id, "PAID")}>Paiement reçu</button>}
                <a className="text-xs text-p360-muted hover:underline" href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer">PDF</a>
              </td>
            </tr>
          ))}
          {invoices.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-p360-muted">Aucune facture. Transformez un devis accepté en facture depuis la fiche prospect.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
