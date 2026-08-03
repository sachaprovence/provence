import "server-only";
import type { OrganizationModel, QuoteModel, QuoteLineModel, LeadModel } from "@/generated/prisma/models";
import { renderCommercialDocumentPdf } from "./commercial-document-pdf";

/** Génération réelle de PDF de devis (brief v0.9 : "PDF") — voir `commercial-document-pdf.ts`. */
export async function generateQuotePdf(params: {
  organization: OrganizationModel;
  quote: QuoteModel;
  lines: QuoteLineModel[];
  lead: LeadModel;
}): Promise<Uint8Array> {
  const { organization, quote, lines, lead } = params;

  const infoLines = [`Date : ${quote.createdAt.toLocaleDateString("fr-FR")}`];
  if (quote.expiresAt) infoLines.push(`Valable jusqu'au : ${quote.expiresAt.toLocaleDateString("fr-FR")}`);
  infoLines.push(`Statut : ${quote.status}`);

  const footerLines: string[] = [];
  if (quote.signatureStatus !== "NONE") {
    footerLines.push(`Signature électronique : ${quote.signatureStatus}${quote.signerName ? ` — ${quote.signerName}` : ""}`);
  }

  return renderCommercialDocumentPdf({
    organization,
    lead,
    title: `DEVIS ${quote.reference}`,
    infoLines,
    lines,
    totals: {
      subtotalAmount: quote.subtotalAmount,
      discountPercent: quote.discountPercent,
      vatRate: quote.vatRate,
      vatAmount: quote.vatAmount,
      totalAmount: quote.totalAmount,
    },
    footerLines,
  });
}
