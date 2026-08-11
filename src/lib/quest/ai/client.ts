import "server-only";
import type { z } from "zod";
import { callAnthropic, parseJsonResponse, requireEnv } from "@/lib/ai/providers/http-helpers";

/**
 * Bas niveau IA de Personal Quest AI (voir ADR 0049) — distinct de
 * `src/lib/ai/` (CRM) et `src/lib/agents/` (Framework d'Agents), mais
 * réutilise les mêmes fondations génériques (`callAnthropic`,
 * `parseJsonResponse`) plutôt que de dupliquer l'appel réseau. Piloté par
 * la même variable `AI_PROVIDER` que le reste du dépôt : un seul
 * interrupteur démo/réel, pas un deuxième.
 *
 * Chaque fonction de domaine (`goal-analyzer.ts`, `quest-generator.ts`...)
 * teste `isDemoMode()` et bascule vers sa propre implémentation
 * déterministe si vraie — jamais un `generateStructured` générique appelé
 * en mode démo (il n'y a pas de LLM à interroger).
 */

const MODEL = "claude-sonnet-5";

export function isDemoMode(): boolean {
  return (process.env.AI_PROVIDER ?? "demo") !== "anthropic";
}

export async function generateStructured<T>(params: {
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  context: string;
  maxTokens?: number;
}): Promise<T> {
  const apiKey = requireEnv("ANTHROPIC_API_KEY", "Anthropic (Personal Quest AI)");
  const text = await callAnthropic({
    apiKey,
    model: MODEL,
    system: params.system,
    prompt: params.prompt,
    maxTokens: params.maxTokens ?? 1536,
  });
  const json = parseJsonResponse<unknown>(text, params.context);
  const result = params.schema.safeParse(json);
  if (!result.success) {
    throw new Error(`Réponse IA invalide pour "${params.context}" : ${result.error.message}`);
  }
  return result.data;
}

export const QUEST_AI_SYSTEM_PROMPT =
  "Tu es Personal Quest AI, un coach personnel + stratège + Game Master + assistant d'exécution. " +
  "Tu transformes un objectif réel en petites actions concrètes, mesurables, jamais génériques. " +
  "Réponds toujours en français, uniquement avec l'objet JSON demandé (sans texte autour, sans bloc markdown), " +
  "sans jamais inventer de faits sur l'utilisateur qui ne t'ont pas été fournis.";
