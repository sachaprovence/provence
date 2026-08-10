import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Rendu PDF tabulaire générique (journal TVA, livre des ventes/dépenses) —
 * `pdf-lib` (déjà une dépendance du dépôt, voir `src/lib/crm/commercial-document-pdf.ts`),
 * pas un nouveau paquet. Volontairement distinct de `commercial-document-pdf.ts`
 * (couplé au format facture/devis avec un `Lead` client) : un export comptable
 * est une grille de lignes, pas un document commercial avec destinataire.
 */

export interface ComptaPdfColumn {
  header: string;
  width: number;
  align?: "left" | "right";
}

export interface ComptaPdfTableParams {
  title: string;
  subtitle?: string;
  columns: ComptaPdfColumn[];
  rows: string[][];
  totalsLine?: string;
}

const PAGE_SIZE: [number, number] = [595.28, 841.89]; // A4
const MARGIN = 40;
const LINE_HEIGHT = 14;

export async function renderComptaTablePdf(params: ComptaPdfTableParams): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  let page = doc.addPage(PAGE_SIZE);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = PAGE_SIZE[1] - MARGIN;

  function ensureSpace() {
    if (y < MARGIN + LINE_HEIGHT * 3) {
      page = doc.addPage(PAGE_SIZE);
      y = PAGE_SIZE[1] - MARGIN;
    }
  }

  function drawRow(cells: string[], useFont: typeof font, size = 9) {
    let x = MARGIN;
    cells.forEach((cell, i) => {
      const col = params.columns[i];
      const textWidth = useFont.widthOfTextAtSize(cell, size);
      const drawX = col.align === "right" ? x + col.width - textWidth : x;
      page.drawText(cell, { x: drawX, y, size, font: useFont, color: rgb(0.1, 0.1, 0.1) });
      x += col.width;
    });
    y -= LINE_HEIGHT;
  }

  page.drawText(params.title, { x: MARGIN, y, size: 14, font: bold, color: rgb(0.1, 0.1, 0.1) });
  y -= LINE_HEIGHT * 1.5;
  if (params.subtitle) {
    page.drawText(params.subtitle, { x: MARGIN, y, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
    y -= LINE_HEIGHT * 1.5;
  }

  drawRow(params.columns.map((c) => c.header), bold);
  y -= 4;

  for (const row of params.rows) {
    ensureSpace();
    drawRow(row, font);
  }

  if (params.totalsLine) {
    y -= LINE_HEIGHT / 2;
    ensureSpace();
    page.drawText(params.totalsLine, { x: MARGIN, y, size: 11, font: bold, color: rgb(0.1, 0.1, 0.1) });
  }

  return doc.save();
}
