/**
 * Calcul des montants d'un devis (brief v0.9 : "Catalogue, Prestations,
 * Remises, TVA") — fonction pure, réutilisée par le service de devis et les
 * tests. Tous les montants sont en centimes (convention déjà utilisée par
 * `Service.basePrice`/`Quote.totalAmount`).
 */

export interface QuoteLineInput {
  quantity: number;
  unitPrice: number;
}

export interface QuoteTotals {
  subtotalAmount: number;
  discountAmount: number;
  vatAmount: number;
  totalAmount: number;
}

export function computeQuoteTotals(lines: QuoteLineInput[], discountPercent: number, vatRate: number): QuoteTotals {
  const subtotalAmount = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const discountAmount = Math.round(subtotalAmount * (discountPercent / 100));
  const afterDiscount = subtotalAmount - discountAmount;
  const vatAmount = Math.round(afterDiscount * (vatRate / 100));
  const totalAmount = afterDiscount + vatAmount;

  return { subtotalAmount, discountAmount, vatAmount, totalAmount };
}
