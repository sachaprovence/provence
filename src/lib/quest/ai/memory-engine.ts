import "server-only";
import type { QuestFeedbackAction, QuestType } from "@/generated/prisma/enums";

/**
 * Mémoire utilisateur à confiance progressive (§13-14 du brief) —
 * DÉLIBÉRÉMENT déterministe, pas d'appel IA : une seule action ne doit
 * jamais devenir une vérité permanente, et ce jugement (combien
 * d'observations avant d'augmenter la confiance) est une règle métier
 * précise, pas une interprétation sémantique qui bénéficierait d'un LLM.
 */

export type FeedbackSample = {
  action: QuestFeedbackAction;
  questType: QuestType;
  createdAt: Date;
};

export type MemoryCandidate = {
  type: "TASK_TYPE_RESISTANCE" | "DURATION_PREFERENCE" | "TIMING_PREFERENCE";
  content: string;
  confidenceHint: number;
  sourceCount: number;
};

const POSTPONE_RESISTANCE_THRESHOLD = 3;
const SHORT_TYPES: QuestType[] = ["MICRO", "SHORT"];
const LONG_TYPES: QuestType[] = ["NORMAL", "DEEP", "BOSS", "CHALLENGE"];

/** Dérive des candidats de mémoire à partir d'un échantillon récent de feedback (typiquement les 30 derniers jours). */
export function deriveMemoryObservations(samples: FeedbackSample[]): MemoryCandidate[] {
  const candidates: MemoryCandidate[] = [];

  const postponedByType = new Map<QuestType, number>();
  for (const sample of samples) {
    if (sample.action !== "POSTPONED") continue;
    postponedByType.set(sample.questType, (postponedByType.get(sample.questType) ?? 0) + 1);
  }
  for (const [type, count] of postponedByType) {
    if (count < POSTPONE_RESISTANCE_THRESHOLD) continue;
    candidates.push({
      type: "TASK_TYPE_RESISTANCE",
      content: `Tend à reporter les quêtes de type ${type.toLowerCase()}.`,
      confidenceHint: Math.min(0.85, 0.25 + count * 0.12),
      sourceCount: count,
    });
  }

  const completed = samples.filter((s) => s.action === "COMPLETED");
  if (completed.length >= 4) {
    const shortCompleted = completed.filter((s) => SHORT_TYPES.includes(s.questType)).length;
    const longCompleted = completed.filter((s) => LONG_TYPES.includes(s.questType)).length;
    const total = shortCompleted + longCompleted;
    if (total > 0 && shortCompleted / total >= 0.75) {
      candidates.push({
        type: "DURATION_PREFERENCE",
        content: "Réussit nettement mieux les tâches courtes (micro/courtes) que les tâches longues.",
        confidenceHint: Math.min(0.85, 0.3 + (shortCompleted / total) * 0.4),
        sourceCount: completed.length,
      });
    }
  }

  if (completed.length >= 5) {
    const buckets = { morning: 0, afternoon: 0, evening: 0 };
    for (const sample of completed) {
      const hour = sample.createdAt.getHours();
      if (hour < 12) buckets.morning += 1;
      else if (hour < 18) buckets.afternoon += 1;
      else buckets.evening += 1;
    }
    const total = completed.length;
    const [bestLabel, bestCount] = (Object.entries(buckets) as [keyof typeof buckets, number][]).reduce((best, entry) =>
      entry[1] > best[1] ? entry : best
    );
    if (bestCount / total >= 0.6) {
      const label = { morning: "le matin", afternoon: "l'après-midi", evening: "le soir" }[bestLabel];
      candidates.push({
        type: "TIMING_PREFERENCE",
        content: `Termine le plus souvent ses quêtes ${label}.`,
        confidenceHint: Math.min(0.85, 0.25 + (bestCount / total) * 0.5),
        sourceCount: total,
      });
    }
  }

  return candidates;
}

/**
 * Fait progresser la confiance d'une mémoire existante lors d'une nouvelle
 * observation confirmant le même pattern (§14) — rendements décroissants :
 * chaque nouvelle confirmation rapproche de l'asymptote sans jamais
 * l'atteindre d'un coup (une seule occurrence ne suffit jamais à elle seule).
 */
export function nextConfidence(current: number, observationCount: number): number {
  const boosted = current + (1 - current) * (0.35 / Math.sqrt(Math.max(1, observationCount)));
  return Math.round(Math.min(0.95, boosted) * 100) / 100;
}
