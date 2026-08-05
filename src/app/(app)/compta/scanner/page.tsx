import { EmptyState } from "@/components/ui";

/**
 * Scanner OCR/IA (reconnaissance de tickets/commandes manuscrites) —
 * fonctionnalité prévue par la spécification mais volontairement non
 * livrée dans ce premier lot : le schéma (`ComptaSaleLine.productId`
 * nullable + `ComptaProduct.aliases`, l'`Attachment` générique existant
 * pour la photo du ticket) est déjà prêt à la recevoir sans migration
 * supplémentaire. Gardée derrière `COMPTA_OCR_ENABLED` (défaut `false`,
 * voir `src/lib/env.ts`) plutôt qu'un `if (vertical === ...)` en dur.
 */
export default function ComptaScannerPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-p360-ink">Scanner de commandes</h1>
      <EmptyState
        title="Bientôt disponible"
        description="La reconnaissance automatique de tickets et commandes manuscrites (OCR + IA) arrive dans une prochaine version. En attendant, enregistrez vos ventes depuis « Ventes → Enregistrer une vente »."
      />
    </div>
  );
}
