import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { OrganizationModel, QuoteModel, QuoteLineModel, LeadModel } from "@/generated/prisma/models";

/**
 * Génération réelle de PDF de devis (brief v0.9 : "PDF") via `pdf-lib`
 * (bibliothèque pure JS, sans dépendance native) — pas un stub : le PDF
 * produit est un document valide, ouvrable tel quel.
 */

function formatEuros(cents: number) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

export async function generateQuotePdf(params: {
  organization: OrganizationModel;
  quote: QuoteModel;
  lines: QuoteLineModel[];
  lead: LeadModel;
}): Promise<Uint8Array> {
  const { organization, quote, lines, lead } = params;
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  let y = 841.89 - margin;
  const lineHeight = 16;

  function text(value: string, options: { size?: number; useFont?: typeof font; color?: [number, number, number] } = {}) {
    page.drawText(value, {
      x: margin,
      y,
      size: options.size ?? 10,
      font: options.useFont ?? font,
      color: options.color ? rgb(...options.color) : rgb(0.1, 0.1, 0.1),
    });
    y -= lineHeight;
  }

  text(organization.name, { size: 16, useFont: bold });
  if (organization.legalAddress) text(organization.legalAddress);
  if (organization.siret) text(`SIRET : ${organization.siret}`);
  if (organization.vatNumber) text(`TVA intracommunautaire : ${organization.vatNumber}`);
  if (organization.phone) text(`Tél : ${organization.phone}`);
  y -= lineHeight;

  text(`DEVIS ${quote.reference}`, { size: 14, useFont: bold });
  text(`Date : ${quote.createdAt.toLocaleDateString("fr-FR")}`);
  if (quote.expiresAt) text(`Valable jusqu'au : ${quote.expiresAt.toLocaleDateString("fr-FR")}`);
  text(`Statut : ${quote.status}`);
  y -= lineHeight;

  text("Client", { useFont: bold });
  text(lead.establishmentName);
  if (lead.address) text(lead.address);
  if (lead.city) text(lead.city);
  y -= lineHeight;

  text("Prestations", { useFont: bold });
  text("Désignation                                    Qté   PU HT      Total HT", { size: 9, useFont: bold });
  for (const line of lines) {
    const lineTotal = line.quantity * line.unitPrice;
    const label = line.label.length > 40 ? `${line.label.slice(0, 37)}...` : line.label;
    text(`${label.padEnd(44)} ${String(line.quantity).padStart(3)}  ${formatEuros(line.unitPrice).padStart(10)}  ${formatEuros(lineTotal).padStart(10)}`, {
      size: 9,
    });
  }
  y -= lineHeight / 2;

  text(`Sous-total HT : ${formatEuros(quote.subtotalAmount)}`, { size: 10 });
  if (quote.discountPercent > 0) {
    const discountAmount = Math.round(quote.subtotalAmount * (quote.discountPercent / 100));
    text(`Remise (${quote.discountPercent}%) : -${formatEuros(discountAmount)}`, { size: 10 });
  }
  text(`TVA (${quote.vatRate}%) : ${formatEuros(quote.vatAmount)}`, { size: 10 });
  text(`Total TTC : ${formatEuros(quote.totalAmount)}`, { size: 12, useFont: bold });
  y -= lineHeight;

  if (quote.signatureStatus !== "NONE") {
    text(`Signature électronique : ${quote.signatureStatus}${quote.signerName ? ` — ${quote.signerName}` : ""}`, { size: 9 });
  }

  return doc.save();
}
