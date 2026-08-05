/**
 * Tous les montants Compta Vellano sont stockés en centimes (Int), TTC —
 * même convention que `Quote`/`Invoice` ailleurs dans le schéma. Cette
 * fonction extrait la part de TVA d'un montant TTC (formule standard
 * "TVA sur marge TTC" : montant × taux / (100 + taux)), utilisée à la fois
 * pour les ventes (prix produit TTC) et les dépenses (montant facture TTC).
 */
export function extractVatFromTtc(amountTtc: number, vatRatePercent: number): number {
  return Math.round((amountTtc * vatRatePercent) / (100 + vatRatePercent));
}

export function formatEuros(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}
