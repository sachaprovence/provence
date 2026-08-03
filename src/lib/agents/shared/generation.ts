import "server-only";
import { renderPrompt } from "@/lib/agents/prompts/prompt-engine";
import { getActiveLlmProvider } from "@/lib/agents/llm";
import { assembleContext } from "@/lib/context/context-engine";

/**
 * Génération narrative partagée par TOUS les agents (Commercial v0.5 et
 * les 7 agents métier v0.9) — extrait de `commercial/generation.ts` pour
 * éviter de dupliquer le câblage Prompt Engine + Context Engine + LLM
 * actif huit fois. `commercial/generation.ts` délègue maintenant ici en
 * conservant sa signature d'origine (zéro régression sur l'Agent
 * Commercial).
 *
 * Passage obligé par le Context Engine (v0.7) avant tout appel IA
 * générative — ADR 0029, RÈGLE NON NÉGOCIABLE pour tout nouvel agent :
 * jamais un agent qui gère lui-même sa mémoire/son contexte.
 */
export async function generateAgentNarrative(params: {
  promptKey: string;
  variables: Record<string, string>;
  scope: { organizationId: string; workspaceId: string; agentScopeId: string };
  systemPrompt: string;
}): Promise<{
  text: string;
  promptKey: string;
  promptVersion: number;
  provider: string;
  model: string;
}> {
  const rendered = await renderPrompt(params.promptKey, params.variables);

  const context = await assembleContext({
    organizationId: params.scope.organizationId,
    workspaceId: params.scope.workspaceId,
    agentScopeId: params.scope.agentScopeId,
    query: rendered.text,
    maxTokens: 1500,
  });

  const provider = getActiveLlmProvider();
  const result = await provider.complete({
    messages: [
      { role: "system", content: params.systemPrompt },
      ...(context.text.trim().length > 0
        ? [{ role: "system" as const, content: `Contexte pertinent (Context Engine) :\n${context.text}` }]
        : []),
      { role: "user" as const, content: rendered.text },
    ],
  });

  return {
    text: result.text,
    promptKey: params.promptKey,
    promptVersion: rendered.version,
    provider: result.provider,
    model: result.model,
  };
}
