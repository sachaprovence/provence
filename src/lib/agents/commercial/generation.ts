import "server-only";
import { generateAgentNarrative } from "@/lib/agents/shared/generation";

/**
 * Combine le moteur de prompts (texte versionné) et le moteur de
 * génération (fournisseur LLM actif, voir ADR 0015/0016) pour produire un
 * texte narratif (email, relance, argumentaire...). Les champs structurés
 * (sujet, montant, statut) restent calculés par le code appelant, jamais
 * extraits par analyse du texte généré — plus robuste qu'un parsing
 * fragile de sortie libre, et fonctionne aussi bien avec le fournisseur de
 * démonstration (texte non structuré) qu'avec un vrai fournisseur LLM.
 *
 * Délègue à `agents/shared/generation.ts` (v0.9, mutualisé avec les 7
 * nouveaux agents métier) — signature inchangée, zéro régression.
 */
export async function generateNarrative(
  promptKey: string,
  variables: Record<string, string>,
  scope: { organizationId: string; workspaceId: string; agentScopeId: string }
): Promise<{
  text: string;
  promptKey: string;
  promptVersion: number;
  provider: string;
  model: string;
}> {
  return generateAgentNarrative({
    promptKey,
    variables,
    scope,
    systemPrompt: "Tu es l'Agent Commercial d'Autorun. Réponds de façon professionnelle, concise et personnalisée.",
  });
}
