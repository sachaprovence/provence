"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPatch, apiPost, ApiError } from "@/lib/api-client";

type Quote = {
  id: string;
  reference: string;
  status: string;
  totalAmount: number;
  lead: { id: string; establishmentName: string };
};

const STATUS_LABEL: Record<string, string> = { DRAFT: "Brouillon", SENT: "Envoyé", ACCEPTED: "Accepté", DECLINED: "Refusé", EXPIRED: "Expiré" };

function formatEuros(cents: number) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

export function QuotesClient({ quotes }: { quotes: Quote[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(id: string, status: string) {
    setBusy(id);
    setError(null);
    try {
      await apiPatch(`/api/quotes/${id}`, { status });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(null);
    }
  }

  async function convertToInvoice(id: string) {
    setBusy(id);
    setError(null);
    try {
      await apiPost(`/api/quotes/${id}/convert-to-invoice`);
      router.push("/invoices");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
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
            <th className="text-left px-4 py-2">Prospect</th>
            <th className="text-left px-4 py-2">Montant</th>
            <th className="text-left px-4 py-2">Statut</th>
            <th className="text-left px-4 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {quotes.map((q) => (
            <tr key={q.id} className="border-t border-p360-lavender-light">
              <td className="px-4 py-2 text-p360-ink">{q.reference}</td>
              <td className="px-4 py-2"><Link href={`/leads/${q.lead.id}`} className="text-p360-blue hover:underline">{q.lead.establishmentName}</Link></td>
              <td className="px-4 py-2 text-p360-ink">{formatEuros(q.totalAmount)}</td>
              <td className="px-4 py-2"><span className="badge bg-p360-lavender-light text-p360-blue">{STATUS_LABEL[q.status]}</span></td>
              <td className="px-4 py-2 space-x-2">
                {q.status === "DRAFT" && <button className="text-xs text-p360-blue hover:underline" disabled={busy === q.id} onClick={() => setStatus(q.id, "SENT")}>Envoyer</button>}
                {q.status === "SENT" && (
                  <>
                    <button className="text-xs text-p360-success hover:underline" disabled={busy === q.id} onClick={() => setStatus(q.id, "ACCEPTED")}>Accepté</button>
                    <button className="text-xs text-p360-danger hover:underline" disabled={busy === q.id} onClick={() => setStatus(q.id, "DECLINED")}>Refusé</button>
                  </>
                )}
                {q.status === "ACCEPTED" && (
                  <button className="text-xs text-p360-success hover:underline" disabled={busy === q.id} onClick={() => convertToInvoice(q.id)}>Transformer en facture</button>
                )}
                <a className="text-xs text-p360-muted hover:underline" href={`/api/quotes/${q.id}/pdf`} target="_blank" rel="noreferrer">PDF</a>
              </td>
            </tr>
          ))}
          {quotes.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-p360-muted">Aucun devis.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
