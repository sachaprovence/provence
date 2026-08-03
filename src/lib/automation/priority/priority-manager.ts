import "server-only";

/**
 * Priority Manager (Automation Engine, v0.8) : niveaux nommés au-dessus du
 * simple entier `AutomationJob.priority`, pour une utilisation cohérente
 * dans toute l'UI/API (plutôt que des nombres magiques dispersés). Le tri
 * effectif (priorité décroissante, puis `scheduledAt` croissant) est déjà
 * appliqué par le Queue Manager (`PostgresQueueProvider#claim`) — ce
 * module ne fait qu'une normalisation, il ne réimplémente aucun tri.
 */
export const AUTOMATION_PRIORITY = {
  LOW: -10,
  NORMAL: 0,
  HIGH: 10,
  CRITICAL: 100,
} as const;

export type AutomationPriorityLevel = keyof typeof AUTOMATION_PRIORITY;

export function priorityLevelToValue(level: AutomationPriorityLevel | number | undefined): number {
  if (level === undefined) return AUTOMATION_PRIORITY.NORMAL;
  if (typeof level === "number") return level;
  return AUTOMATION_PRIORITY[level];
}

/** Niveau nommé le plus proche d'une valeur numérique arbitraire — pour l'affichage (ex. badge "HIGH") d'un job dont la priorité n'est pas exactement un des niveaux nommés. */
export function priorityValueToClosestLevel(value: number): AutomationPriorityLevel {
  const entries = Object.entries(AUTOMATION_PRIORITY) as [AutomationPriorityLevel, number][];
  return entries.reduce(
    (closest, [level, levelValue]) => (Math.abs(levelValue - value) < Math.abs(AUTOMATION_PRIORITY[closest] - value) ? level : closest),
    entries[0][0]
  );
}
