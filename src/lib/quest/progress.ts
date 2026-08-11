/**
 * Progression pondérée d'un objectif (§22 du brief) — jamais "1 quête = 1%".
 * Chaque jalon pèse `weight` dans le total ; la fraction de complétion d'un
 * jalon dépend du poids d'impact (`impactWeight`) des quêtes terminées sous
 * ce jalon, pas de leur nombre. Un jalon marqué DONE compte toujours pour
 * 100%, même sans quête associée (l'utilisateur/l'IA peut valider un jalon
 * directement).
 */

export type ProgressQuest = {
  milestoneId: string | null;
  impactWeight: number;
  completed: boolean;
};

export type ProgressMilestone = {
  id: string;
  weight: number;
  done: boolean;
};

export function computeGoalProgress(milestones: ProgressMilestone[], quests: ProgressQuest[]): number {
  const questsByMilestone = new Map<string, ProgressQuest[]>();
  const questsWithoutMilestone: ProgressQuest[] = [];
  for (const quest of quests) {
    if (quest.milestoneId) {
      const list = questsByMilestone.get(quest.milestoneId) ?? [];
      list.push(quest);
      questsByMilestone.set(quest.milestoneId, list);
    } else {
      questsWithoutMilestone.push(quest);
    }
  }

  if (milestones.length === 0) {
    return fractionFromQuests(questsWithoutMilestone) * 100;
  }

  let weightedSum = 0;
  let totalWeight = 0;
  for (const milestone of milestones) {
    const weight = Math.max(0, milestone.weight);
    totalWeight += weight;
    if (milestone.done) {
      weightedSum += weight;
      continue;
    }
    const milestoneQuests = questsByMilestone.get(milestone.id) ?? [];
    weightedSum += weight * fractionFromQuests(milestoneQuests);
  }

  if (totalWeight === 0) return 0;
  return Math.round((weightedSum / totalWeight) * 1000) / 10;
}

function fractionFromQuests(quests: ProgressQuest[]): number {
  if (quests.length === 0) return 0;
  const totalImpact = quests.reduce((sum, q) => sum + Math.max(0, q.impactWeight), 0);
  if (totalImpact === 0) return 0;
  const doneImpact = quests.filter((q) => q.completed).reduce((sum, q) => sum + Math.max(0, q.impactWeight), 0);
  return Math.max(0, Math.min(1, doneImpact / totalImpact));
}
