import "server-only";
import { BLOCKER_ANALYSIS_POSTPONE_THRESHOLD } from "@/lib/quest/difficulty-engine";

/**
 * Gestion des blocages (§18 du brief) — décision déterministe (seuils, pas
 * d'interprétation sémantique) sur QUAND décomposer une quête. La
 * décomposition elle-même (QUOI proposer à la place) vient de
 * `quest-generator.ts` (mode "DECOMPOSE"), appelée par le service une fois
 * cette décision prise.
 */
export type BlockerDecision = {
  shouldDecompose: boolean;
  reason: string | null;
};

export function analyzeBlocker(params: { postponeCount: number; blockedFeedbackCount: number }): BlockerDecision {
  if (params.blockedFeedbackCount >= 1) {
    return { shouldDecompose: true, reason: "Signalée bloquée par l'utilisateur." };
  }
  if (params.postponeCount >= BLOCKER_ANALYSIS_POSTPONE_THRESHOLD) {
    return {
      shouldDecompose: true,
      reason: `Reportée ${params.postponeCount} fois — probablement trop grande ou mal définie ; ne pas la reproposer telle quelle (§18 du brief).`,
    };
  }
  return { shouldDecompose: false, reason: null };
}
