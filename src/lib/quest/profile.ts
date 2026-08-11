/**
 * Modèle utilisateur dynamique (Dynamic User Model) — dérive les dimensions
 * comportementales de `QuestUserProfile` à partir de signaux déjà mesurés
 * ailleurs (stats d'activité, mémoire sémantique, historique de feedback),
 * jamais d'une collecte séparée. Fonctions pures, testables sans base de
 * données — la lecture/écriture réelle vit dans `profile-service.ts`.
 *
 * Principe explicite (§15 du brief) : pas de pseudo-psychologie. Chaque
 * dimension est une dérivation traçable d'un signal observé, documentée
 * comme telle, jamais une estimation inventée.
 */

export type TimeOfDayBucket = "morning" | "afternoon" | "evening";

export type ProfileInputs = {
  /** `QuestUserStat.constanceScore` (0-100) — déjà la mesure faisant autorité de la régularité, pas recalculée en parallèle. */
  constanceScore: number;
  /** `QuestUserProfile.challengeScore` (1-100) — idem, déjà la mesure faisant autorité de la difficulté tolérée. */
  challengeScore: number;
  /** Quêtes DEEP/BOSS terminées sur la fenêtre récente (30j). */
  deepBossCompleted: number;
  /** Quêtes DEEP/BOSS reportées/bloquées/remplacées sur la même fenêtre. */
  deepBossFailed: number;
  /** Confiance de la mémoire globale `DURATION_PREFERENCE` active, si elle existe (toujours dans le sens "préfère les tâches courtes" — voir `memory-engine.ts`). */
  durationPreferenceConfidence: number | null;
  /** Créneau horaire majoritaire des complétions récentes, si un créneau se détache nettement (même seuil que `TIMING_PREFERENCE`, voir `momentum.ts#bucketTimeOfDayMajority`). */
  timeOfDayMajority: { bucket: TimeOfDayBucket; ratio: number } | null;
  /** Messages utilisateur envoyés à l'assistant sur la fenêtre récente (30j). */
  assistantMessageCount: number;
  /** Quêtes terminées sur la même fenêtre — dénominateur du ratio d'autonomie. */
  completedCount: number;
};

export type ProfileOutputs = {
  regularityScore: number;
  enduranceScore: number;
  shortTaskPreference: number;
  effectiveHours: string[];
  autonomyScore: number;
  difficultyTolerance: number;
  actionStyle: string;
};

const NEUTRAL = 0.5;

export function computeUserProfile(inputs: ProfileInputs): ProfileOutputs {
  const regularityScore = clamp01(inputs.constanceScore / 100);

  const deepBossTotal = inputs.deepBossCompleted + inputs.deepBossFailed;
  const enduranceScore = deepBossTotal === 0 ? NEUTRAL : clamp01(inputs.deepBossCompleted / deepBossTotal);

  const shortTaskPreference = inputs.durationPreferenceConfidence ?? NEUTRAL;

  const effectiveHours = inputs.timeOfDayMajority ? [inputs.timeOfDayMajority.bucket] : [];

  // Ratio de dépendance à l'assistant plutôt qu'une traçabilité exacte quête par quête
  // (qui demanderait de croiser le JSON des actions assistant avec chaque quête terminée) —
  // approximation simple et honnête, documentée comme telle.
  const autonomyScore = inputs.completedCount === 0 ? NEUTRAL : clamp01(1 - inputs.assistantMessageCount / (inputs.completedCount * 2));

  // Dérivé directement de `challengeScore` (déjà la mesure faisant autorité de la difficulté
  // tolérée) plutôt que recalculé indépendamment — évite deux sources de vérité qui pourraient diverger.
  const difficultyTolerance = clamp01(inputs.challengeScore / 100);

  const actionStyle = deriveActionStyle(regularityScore, shortTaskPreference);

  return { regularityScore, enduranceScore, shortTaskPreference, effectiveHours, autonomyScore, difficultyTolerance, actionStyle };
}

function deriveActionStyle(regularityScore: number, shortTaskPreference: number): string {
  if (regularityScore < 0.4) return "sporadique";
  if (shortTaskPreference >= 0.6) return "regulier-court";
  if (shortTaskPreference < 0.4) return "regulier-profond";
  return "mixte";
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
