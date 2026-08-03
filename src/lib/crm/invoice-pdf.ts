import "server-only";
import type { OrganizationModel, InvoiceModel, InvoiceLineModel, LeadModel } from "@/generated/prisma/models";
import { renderCommercialDocumentPdf } from "./commercial-document-pdf";

/** Génération réelle de PDF de facture (brief v0.9 : "PDF") — voir `commercial-document-pdf.ts`. */
export async function generateInvoicePdf(params: {
  organization: OrganizationModel;
  invoice: InvoiceModel;
  lines: InvoiceLineModel[];
  lead: LeadModel;
}): Promise<Uint8Array> {
  const { organization, invoice, lines, lead } = params;

  const infoLines = [`Date : ${invoice.createdAt.toLocaleDateString("fr-FR")}`];
  if (invoice.dueAt) infoLines.push(`Échéance : ${invoice.dueAt.toLocaleDateString("fr-FR")}`);
  infoLines.push(`Statut : ${invoice.status}`);

  const footerLines: string[] = [];
  if (invoice.paidAt) footerLines.push(`Payée le ${invoice.paidAt.toLocaleDateString("fr-FR")}`);

  // TVA/remise déjà réparties par ligne (`vatRate` par `InvoiceLine`) — la facture affiche un taux
  // de TVA moyen pondéré pour rester lisible sur une ligne de synthèse (pas de remise globale : la
  // remise a déjà été appliquée au moment de la conversion depuis le devis, voir `invoice-service.ts`).
  const vatRate = invoice.totalAmount > invoice.vatAmount && invoice.totalAmount - invoice.vatAmount > 0
    ? Math.round((invoice.vatAmount / (invoice.totalAmount - invoice.vatAmount)) * 10000) / 100
    : 0;

  return renderCommercialDocumentPdf({
    organization,
    lead,
    title: `FACTURE ${invoice.reference}`,
    infoLines,
    lines,
    totals: {
      subtotalAmount: invoice.totalAmount - invoice.vatAmount,
      vatRate,
      vatAmount: invoice.vatAmount,
      totalAmount: invoice.totalAmount,
    },
    footerLines,
  });
}
