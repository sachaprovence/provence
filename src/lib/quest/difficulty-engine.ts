/**
 * Difficulté adaptative (§16 du brief) — `challengeScore` (1-100) par
 * utilisateur, ajusté par petits pas à partir du comportement observé.
 * L'objectif n'est pas de rendre l'app difficile mais de maximiser la
 * progression réelle sur la durée : trop facile → augmenter progressivement ;
 * trop souvent abandonné → réduire taille/difficulté.
 */

export type DifficultySignal = {
  /** Quêtes terminées dans les temps/en avance, sans signal négatif — indique que le niveau actuel est bien calibré. */
  completedSmoothlyCount: number;
  tooEasyCount: number;
  tooHardCount: number;
  abandonedOrBlockedCount: number;
  postponedCount: number;
};

export function adjustChallengeScore(current: number, signal: DifficultySignal): number {
  let delta = 0;
  delta += signal.tooEasyCount * 4;
  delta -= signal.tooHardCount * 6;
  delta -= signal.abandonedOrBlockedCount * 8;
  delta -= signal.postponedCount * 2;
  // Hausse douce seulement si aucun signal négatif récent (pas de compensation d'un abandon par 3 réussites le même jour).
  if (signal.completedSmoothlyCount >= 3 && signal.tooHardCount === 0 && signal.abandonedOrBlockedCount === 0) {
    delta += 3;
  }
  return Math.max(1, Math.min(100, Math.round(current + delta)));
}

export type DifficultyBand = { minDifficulty: number; maxDifficulty: number };

/** Traduit le challengeScore en fourchette de difficulté (1-5) cible pour la génération de quêtes. */
export function challengeScoreToDifficultyBand(score: number): DifficultyBand {
  if (score < 20) return { minDifficulty: 1, maxDifficulty: 1 };
  if (score < 40) return { minDifficulty: 1, maxDifficulty: 2 };
  if (score < 60) return { minDifficulty: 2, maxDifficulty: 3 };
  if (score < 80) return { minDifficulty: 3, maxDifficulty: 4 };
  return { minDifficulty: 4, maxDifficulty: 5 };
}

/**
 * Répétition de report ≠ dégoût permanent (§18 du brief). Seuil au-delà
 * duquel on considère qu'il faut analyser un blocage plutôt que représenter
 * la même quête telle quelle.
 */
export const BLOCKER_ANALYSIS_POSTPONE_THRESHOLD = 2;
