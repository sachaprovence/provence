"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiPatch, apiPost, ApiError } from "@/lib/api-client";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type { getQuote, listQuoteVersions } from "@/lib/crm/quote-service";

type QuoteDetail = Awaited<ReturnType<typeof getQuote>>;
type QuoteVersionSnapshot = {
  reference: string;
  discountPercent: number;
  vatRate: number;
  subtotalAmount: number;
  vatAmount: number;
  totalAmount: number;
  lines: { label: string; quantity: number; unitPrice: number }[];
};

const STATUS_LABEL: Record<string, string> = { DRAFT: "Brouillon", SENT: "Envoyé", ACCEPTED: "Accepté", DECLINED: "Refusé", EXPIRED: "Expiré" };

function formatEuros(cents: number) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}
function formatDate(d: Date | string) {
  return new Date(d).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Historique des versions (v1.1, AR-0168) — `QuoteVersion` capture déjà un
 * instantané JSON à chaque passage DRAFT→SENT mais n'était consultable
 * nulle part (écriture sans jamais aucune lecture).
 */
export function QuoteDetailClient({
  quote,
  versions,
}: {
  quote: QuoteDetail;
  versions: Awaited<ReturnType<typeof listQuoteVersions>>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);

  async function setStatus(status: string) {
    setBusy(true);
    setError(null);
    try {
      await apiPatch(`/api/quotes/${quote.id}`, { status });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  async function convertToInvoice() {
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/quotes/${quote.id}/convert-to-invoice`);
      router.push("/invoices");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/quotes" className="text-sm text-p360-blue hover:underline">
          ← Devis
        </Link>
        <div className="flex items-center gap-2 mt-1">
          <h1 className="text-2xl font-semibold text-p360-ink">{quote.reference}</h1>
          <span className="badge bg-p360-lavender-light text-p360-blue">{STATUS_LABEL[quote.status] ?? quote.status}</span>
        </div>
        <p className="text-sm text-p360-muted mt-1">
          Prospect/client : <Link href={`/leads/${quote.lead.id}`} className="text-p360-blue hover:underline">{quote.lead.establishmentName}</Link>
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
              <th className="text-right py-1">Total</th>
            </tr>
          </thead>
          <tbody>
            {quote.lines.map((line) => (
              <tr key={line.id} className="border-t border-p360-lavender-light">
                <td className="py-1.5 text-p360-ink">{line.label}</td>
                <td className="py-1.5 text-right text-p360-ink">{line.quantity}</td>
                <td className="py-1.5 text-right text-p360-ink">{formatEuros(line.unitPrice)}</td>
                <td className="py-1.5 text-right text-p360-ink">{formatEuros(line.quantity * line.unitPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-p360-lavender-light mt-3 pt-3 text-sm space-y-1 text-right">
          <div className="text-p360-muted">Sous-total : {formatEuros(quote.subtotalAmount)}</div>
          {quote.discountPercent > 0 && <div className="text-p360-muted">Remise : {quote.discountPercent}%</div>}
          <div className="text-p360-muted">TVA ({quote.vatRate}%) : {formatEuros(quote.vatAmount)}</div>
          <div className="text-p360-ink font-semibold">Total : {formatEuros(quote.totalAmount)}</div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {quote.status === "DRAFT" && <button className="btn-primary" disabled={busy} onClick={() => setStatus("SENT")}>Envoyer</button>}
          {quote.status === "SENT" && (
            <>
              <button className="btn-secondary" disabled={busy} onClick={() => setStatus("ACCEPTED")}>Marquer accepté</button>
              <button className="btn-danger" disabled={busy} onClick={() => setStatus("DECLINED")}>Marquer refusé</button>
            </>
          )}
          {quote.status === "ACCEPTED" && <button className="btn-primary" disabled={busy} onClick={convertToInvoice}>Transformer en facture</button>}
          <a className="btn-secondary" href={`/api/quotes/${quote.id}/pdf`} target="_blank" rel="noreferrer">Télécharger le PDF</a>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historique des versions ({versions.length})</CardTitle>
        </CardHeader>
        <ul className="space-y-2">
          {versions.map((version) => {
            const snapshot = version.snapshot as unknown as QuoteVersionSnapshot;
            const expanded = expandedVersion === version.id;
            return (
              <li key={version.id} className="border border-p360-lavender-light rounded-lg px-3 py-2">
                <button
                  type="button"
                  className="flex items-center justify-between w-full text-sm text-left"
                  onClick={() => setExpandedVersion(expanded ? null : version.id)}
                >
                  <span className="text-p360-ink font-medium">Version {version.versionNumber}</span>
                  <span className="text-p360-muted">{formatEuros(version.totalAmount)} — {formatDate(version.createdAt)}</span>
                </button>
                {expanded && (
                  <ul className="mt-2 text-xs text-p360-muted space-y-0.5">
                    {snapshot.lines.map((l, i) => (
                      <li key={i}>{l.label} — {l.quantity} × {formatEuros(l.unitPrice)}</li>
                    ))}
                    <li>Remise : {snapshot.discountPercent}% — TVA : {snapshot.vatRate}%</li>
                  </ul>
                )}
              </li>
            );
          })}
          {versions.length === 0 && <p className="text-sm text-p360-muted">Aucune version figée pour l&apos;instant — envoyez le devis pour créer la première version.</p>}
        </ul>
      </Card>
    </div>
  );
}
