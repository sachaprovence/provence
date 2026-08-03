import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { OrganizationModel, LeadModel } from "@/generated/prisma/models";

/**
 * Rendu PDF générique partagé par les devis et les factures (brief v0.9 :
 * "PDF" pour les deux, "Aucune duplication") — via `pdf-lib` (pure JS, sans
 * dépendance native), pas un stub : document valide, ouvrable tel quel.
 */

export function formatEuros(cents: number) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

export interface CommercialDocumentLine {
  label: string;
  quantity: number;
  unitPrice: number;
}

export interface CommercialDocumentTotals {
  subtotalAmount: number;
  discountPercent?: number;
  vatRate: number;
  vatAmount: number;
  totalAmount: number;
}

export async function renderCommercialDocumentPdf(params: {
  organization: OrganizationModel;
  lead: LeadModel;
  title: string;
  infoLines: string[];
  lines: CommercialDocumentLine[];
  totals: CommercialDocumentTotals;
  footerLines?: string[];
}): Promise<Uint8Array> {
  const { organization, lead, title, infoLines, lines, totals, footerLines } = params;
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  let y = 841.89 - margin;
  const lineHeight = 16;

  function text(value: string, options: { size?: number; useFont?: typeof font } = {}) {
    page.drawText(value, {
      x: margin,
      y,
      size: options.size ?? 10,
      font: options.useFont ?? font,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= lineHeight;
  }

  text(organization.name, { size: 16, useFont: bold });
  if (organization.legalAddress) text(organization.legalAddress);
  if (organization.siret) text(`SIRET : ${organization.siret}`);
  if (organization.vatNumber) text(`TVA intracommunautaire : ${organization.vatNumber}`);
  if (organization.phone) text(`Tél : ${organization.phone}`);
  y -= lineHeight;

  text(title, { size: 14, useFont: bold });
  for (const line of infoLines) text(line);
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

  text(`Sous-total HT : ${formatEuros(totals.subtotalAmount)}`, { size: 10 });
  if (totals.discountPercent && totals.discountPercent > 0) {
    const discountAmount = Math.round(totals.subtotalAmount * (totals.discountPercent / 100));
    text(`Remise (${totals.discountPercent}%) : -${formatEuros(discountAmount)}`, { size: 10 });
  }
  text(`TVA (${totals.vatRate}%) : ${formatEuros(totals.vatAmount)}`, { size: 10 });
  text(`Total TTC : ${formatEuros(totals.totalAmount)}`, { size: 12, useFont: bold });
  y -= lineHeight;

  for (const line of footerLines ?? []) text(line, { size: 9 });

  return doc.save();
}
