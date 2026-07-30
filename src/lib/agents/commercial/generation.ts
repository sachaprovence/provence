import "server-only";
import { renderPrompt } from "@/lib/agents/prompts/prompt-engine";
import { getActiveLlmProvider } from "@/lib/agents/llm";
import { assembleContext } from "@/lib/context/context-engine";

/**
 * Combine le moteur de prompts (texte versionné) et le moteur de
 * génération (fournisseur LLM actif, voir ADR 0015/0016) pour produire un
 * texte narratif (email, relance, argumentaire...). Les champs structurés
 * (sujet, montant, statut) restent calculés par le code appelant, jamais
 * extraits par analyse du texte généré — plus robuste qu'un parsing
 * fragile de sortie libre, et fonctionne aussi bien avec le fournisseur de
 * démonstration (texte non structuré) qu'avec un vrai fournisseur LLM.
 *
 * Passage obligé par le Context Engine (v0.7) avant tout appel IA — voir
 * ADR 0029 : l'Agent Commercial ne gère jamais lui-même son contexte, il
 * délègue systématiquement la sélection (documents/mémoire/préférences
 * utiles) à `assembleContext`.
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
  const rendered = await renderPrompt(promptKey, variables);

  // Pas de restriction `sourceTypes` : toute connaissance indexée pertinente
  // pour le texte du prompt rendu peut aider (fiches CRM, devis,
  // conversations, mais aussi notes/documentation internes) — "multi-sources"
  // du brief, le classement (recherche hybride) fait le tri, pas un filtre a priori.
  const context = await assembleContext({
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    agentScopeId: scope.agentScopeId,
    query: rendered.text,
    maxTokens: 1500,
  });

  const provider = getActiveLlmProvider();
  const result = await provider.complete({
    messages: [
      {
        role: "system",
        content: "Tu es l'Agent Commercial d'Autorun. Réponds de façon professionnelle, concise et personnalisée.",
      },
      ...(context.text.trim().length > 0
        ? [{ role: "system" as const, content: `Contexte pertinent (Context Engine) :\n${context.text}` }]
        : []),
      { role: "user" as const, content: rendered.text },
    ],
  });

  return {
    text: result.text,
    promptKey,
    promptVersion: rendered.version,
    provider: result.provider,
    model: result.model,
  };
}
