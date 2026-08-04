import type { BillingProvider } from "./types";
import { DemoBillingProvider } from "./demo-provider";
import { StripeBillingProvider } from "./providers/stripe";

/**
 * Fournisseur de facturation actif, choisi via `BILLING_PROVIDER` (défaut
 * `"demo"`) — même convention que `getEmailProvider()`/`getAIProvider()` :
 * le CHOIX du fournisseur est un réglage de déploiement, jamais par
 * organisation (c'est Autorun, l'éditeur, qui facture — pas un identifiant
 * par client).
 */
export function getBillingProvider(): BillingProvider {
  const kind = process.env.BILLING_PROVIDER ?? "demo";
  switch (kind) {
    case "stripe":
      return new StripeBillingProvider();
    case "demo":
    default:
      return new DemoBillingProvider();
  }
}

export * from "./types";
