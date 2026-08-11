import "server-only";
import { generateStructured, isDemoMode, QUEST_AI_SYSTEM_PROMPT } from "./client";
import { NextActionArbitrationSchema, type NextActionArbitration } from "./schemas";
import { formatUserContextForPrompt, type UserContext } from "@/lib/quest/context-builder";
import type { NextBestAction } from "@/lib/quest/scoring";

/**
 * Arbitrage borné de `getNextBestAction` (ajustement §4 validé par
 * l'utilisateur) — le scoring déterministe (`scoring.ts`) reste TOUJOURS
 * autoritaire. Le LLM ne fait qu'expliquer le choix déterministe, ou, dans
 * des conditions strictement bornées, départager les 2-3 meilleurs candidats
 * quand leurs scores sont proches et le contexte suffisamment riche pour que
 * cela ait un sens. Il ne peut JAMAIS :
 *   - rendre éligible une quête qui ne l'était pas (dépendances non
 *     résolues déjà exclues avant `getTopCandidates`) ;
 *   - dépasser les contraintes de charge (déjà appliquées dans le score) ;
 *   - choisir une quête hors de l'ensemble pré-filtré fourni ici.
 * Toute violation, réponse invalide, ou confiance insuffisante retombe sur
 * le résultat déterministe (fail-open) — jamais une erreur pour l'utilisateur
 * final sur ce chemin, la sélection déterministe seule est déjà correcte.
 */

const NEAR_TIE_SCORE_RATIO = 0.85; // un candidat sous ce ratio du meilleur score n'est jamais un dépassement plausible
const ARBITRATION_CONFIDENCE_THRESHOLD = 0.7;
const MIN_STRATEGY_INSIGHTS_FOR_SUFFICIENT_CONTEXT = 1;
const MIN_EPISODES_FOR_SUFFICIENT_CONTEXT = 3;

function topFactorLabels(action: NextBestAction): string[] {
  const { breakdown } = action;
  const labeled: { label: string; value: number }[] = [
    { label: "priorité de l'objectif/quête", value: breakdown.priorityWeight },
    { label: "urgence de l'échéance", value: breakdown.urgencyWeight },
    { label: "adéquation au contexte", value: breakdown.contextFit },
    { label: "adéquation à l'énergie disponible", value: breakdown.energyFit },
    { label: "adéquation à la durée disponible", value: breakdown.durationFit },
    { label: "progression de l'objectif", value: breakdown.progressValue },
  ];
  return labeled
    .filter((f) => f.value > 1.05)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((f) => f.label);
}

/**
 * Baseline toujours disponible, sans appel IA — la sélection déterministe
 * elle-même, seulement mise en mots. Utilisée telle quelle en mode démo et
 * comme filet de repli en mode réel.
 */
export function explainDeterministic(top: NextBestAction[]): NextActionArbitration {
  const winner = top[0];
  if (!winner) throw new Error("explainDeterministic appelé sans candidat.");
  return {
    selectedQuestId: winner.quest.id,
    reason: "Meilleur score déterministe (priorité, urgence, adéquation au contexte et à l'énergie disponible).",
    confidence: 1,
    contextFactorsUsed: topFactorLabels(winner),
  };
}

function hasSufficientContext(context: UserContext): boolean {
  return (
    context.strategyInsights.length >= MIN_STRATEGY_INSIGHTS_FOR_SUFFICIENT_CONTEXT ||
    context.recentEpisodes.length >= MIN_EPISODES_FOR_SUFFICIENT_CONTEXT
  );
}

function isNearTie(top: NextBestAction[]): boolean {
  const bestScore = top[0]?.breakdown.score ?? 0;
  if (bestScore <= 0) return false;
  return top.slice(1, 3).some((c) => c.breakdown.score >= bestScore * NEAR_TIE_SCORE_RATIO);
}

/**
 * Arbitrage borné : n'appelle le LLM que si un dépassement du #1 a un sens
 * (égalité relative + contexte suffisant) ; valide strictement la réponse
 * avant de jamais s'en servir pour dévier du résultat déterministe.
 */
export async function arbitrateNextAction(params: { top: NextBestAction[]; context: UserContext }): Promise<NextActionArbitration> {
  const { top, context } = params;
  if (top.length === 0) throw new Error("arbitrateNextAction appelé sans candidat.");

  const deterministic = explainDeterministic(top);
  if (isDemoMode()) return deterministic;
  if (top.length === 1) return deterministic;
  if (!isNearTie(top) || !hasSufficientContext(context)) return deterministic;

  const candidateList = top
    .map(
      (c, i) =>
        `${i + 1}. id="${c.quest.id}" — score déterministe ${c.breakdown.score} (priorité ${c.breakdown.priorityWeight.toFixed(2)}, urgence ${c.breakdown.urgencyWeight.toFixed(2)}, adéquation contexte ${c.breakdown.contextFit.toFixed(2)}, adéquation énergie ${c.breakdown.energyFit.toFixed(2)}, adéquation durée ${c.breakdown.durationFit.toFixed(2)}, progression objectif ${c.breakdown.progressValue.toFixed(2)})`
    )
    .join("\n");

  const prompt = `Les candidats suivants ont déjà été sélectionnés et scorés par un moteur déterministe — tu ne peux choisir que parmi EUX, jamais une autre quête :
${candidateList}

Leurs scores sont proches : c'est le SEUL cas où ton avis peut légitimement changer le choix par défaut (le candidat #1). Utilise le contexte utilisateur ci-dessous pour juger si un autre candidat que #1 correspond réellement mieux à la situation actuelle. Si tu n'es pas clairement plus confiant que le score déterministe, choisis #1.

${formatUserContextForPrompt(context)}

Réponds UNIQUEMENT avec un objet JSON au format exact :
{
  "selectedQuestId": string (un des id ci-dessus, EXACTEMENT),
  "reason": string (une phrase courte, destinée à l'utilisateur),
  "confidence": number (0 à 1),
  "contextFactorsUsed": string[] (les éléments de contexte réellement utilisés pour ce choix, s'il y en a)
}`;

  let arbitration: NextActionArbitration;
  try {
    arbitration = await generateStructured({
      schema: NextActionArbitrationSchema,
      system: QUEST_AI_SYSTEM_PROMPT,
      prompt,
      context: "next-action-explainer",
    });
  } catch {
    return deterministic; // fail-open : jamais d'erreur utilisateur sur ce chemin, le résultat déterministe suffit.
  }

  const isEligibleCandidate = top.some((c) => c.quest.id === arbitration.selectedQuestId);
  if (!isEligibleCandidate || arbitration.confidence < ARBITRATION_CONFIDENCE_THRESHOLD) {
    return deterministic;
  }

  return arbitration;
}
