import { EmptyState } from "@/components/ui";

/**
 * Assistant IA comptable (questions en langage naturel, détection
 * d'anomalies, résumé mensuel) — prévu par la spécification, non livré
 * dans ce premier lot. À construire au-dessus de l'abstraction `AIProvider`
 * déjà en place (`src/lib/ai/`), gardé derrière `COMPTA_AI_ASSISTANT_ENABLED`
 * (défaut `false`, voir `src/lib/env.ts`) une fois implémenté.
 */
export default function ComptaAssistantPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-p360-ink">Assistant IA</h1>
      <EmptyState
        title="Bientôt disponible"
        description="L'assistant comptable (questions en langage naturel, résumé mensuel, détection d'anomalies) arrive dans une prochaine version."
      />
    </div>
  );
}
