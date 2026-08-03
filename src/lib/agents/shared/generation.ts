import "server-only";
import { renderPrompt } from "@/lib/agents/prompts/prompt-engine";
import { getActiveLlmProvider } from "@/lib/agents/llm";
import { assembleContext } from "@/lib/context/context-engine";
import { assertAiQuotaAvailable, estimateGenericAiCostUsd } from "@/lib/ai/quota";
import { prisma } from "@/lib/prisma";

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
 *
 * Quota IA (AR-0051, v0.9 bis) : vérifié AVANT tout appel réel — lève
 * `QuotaExceededError` si l'organisation a atteint son
 * `aiMonthlyBudgetUsd`. Chaque appel réussi journalise une ligne
 * `AIRequest` (`kind: AGENT_NARRATIVE`, coût estimé génériquement — le
 * fournisseur LLM actif peut être n'importe lequel des 8 enregistrés,
 * voir `estimateGenericAiCostUsd`) : c'est cette même table qui alimente
 * le calcul du quota, donc les appels du Framework des Agents comptent
 * désormais dans le même budget que la couche IA historique.
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
  await assertAiQuotaAvailable(params.scope.organizationId);

  const rendered = await renderPrompt(params.promptKey, params.variables);

  const context = await assembleContext({
    organizationId: params.scope.organizationId,
    workspaceId: params.scope.workspaceId,
    agentScopeId: params.scope.agentScopeId,
    query: rendered.text,
    maxTokens: 1500,
  });

  const contextText = context.text.trim().length > 0 ? `Contexte pertinent (Context Engine) :\n${context.text}` : null;

  const provider = getActiveLlmProvider();
  const result = await provider.complete({
    messages: [
      { role: "system", content: params.systemPrompt },
      ...(contextText ? [{ role: "system" as const, content: contextText }] : []),
      { role: "user" as const, content: rendered.text },
    ],
  });

  const promptChars = params.systemPrompt.length + (contextText?.length ?? 0) + rendered.text.length;
  await prisma.aIRequest.create({
    data: {
      organizationId: params.scope.organizationId,
      kind: "AGENT_NARRATIVE",
      provider: result.provider,
      model: result.model,
      prompt: params.promptKey,
      response: result.text,
      estimatedCostUsd: estimateGenericAiCostUsd(promptChars, result.text.length),
      status: "COMPLETED",
    },
  });

  return {
    text: result.text,
    promptKey: params.promptKey,
    promptVersion: rendered.version,
    provider: result.provider,
    model: result.model,
  };
}
