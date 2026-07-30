import "server-only";
import { renderPrompt } from "@/lib/agents/prompts/prompt-engine";
import { getActiveLlmProvider } from "@/lib/agents/llm";

/**
 * Combine le moteur de prompts (texte versionné) et le moteur de
 * génération (fournisseur LLM actif, voir ADR 0015/0016) pour produire un
 * texte narratif (email, relance, argumentaire...). Les champs structurés
 * (sujet, montant, statut) restent calculés par le code appelant, jamais
 * extraits par analyse du texte généré — plus robuste qu'un parsing
 * fragile de sortie libre, et fonctionne aussi bien avec le fournisseur de
 * démonstration (texte non structuré) qu'avec un vrai fournisseur LLM.
 */
export async function generateNarrative(promptKey: string, variables: Record<string, string>): Promise<{
  text: string;
  promptKey: string;
  promptVersion: number;
  provider: string;
  model: string;
}> {
  const rendered = await renderPrompt(promptKey, variables);
  const provider = getActiveLlmProvider();

  const result = await provider.complete({
    messages: [
      {
        role: "system",
        content: "Tu es l'Agent Commercial d'Autorun. Réponds de façon professionnelle, concise et personnalisée.",
      },
      { role: "user", content: rendered.text },
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
