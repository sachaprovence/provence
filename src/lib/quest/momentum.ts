/**
 * Jauges d'activité (§23-24/§27 du brief) — discipline, constance, momentum,
 * streak. Fonctions pures sur des agrégats déjà calculés côté appelant
 * (`src/lib/quest/quest-stat-service.ts`), jamais de requête Prisma ici :
 * ça garde ce module testable sans base de données.
 */

export function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dayDiff(a: string, b: string): number {
  const msPerDay = 86_400_000;
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / msPerDay);
}

export type StreakResult = { current: number; best: number };

/**
 * `activeDayKeys` : jours (clé `YYYY-MM-DD`) où au moins une quête a été
 * terminée — pas nécessairement triés ni uniques en entrée. `todayKey` : jour
 * courant, pour savoir si le streak est toujours "vivant" (le streak ne casse
 * pas tant que le jour courant n'est pas terminé sans activité).
 */
export function computeStreaks(activeDayKeys: string[], todayKey: string): StreakResult {
  const days = Array.from(new Set(activeDayKeys)).sort();
  if (days.length === 0) return { current: 0, best: 0 };

  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    run = dayDiff(days[i - 1], days[i]) === 1 ? run + 1 : 1;
    if (run > best) best = run;
  }

  const lastActiveDay = days[days.length - 1];
  const gapFromToday = dayDiff(lastActiveDay, todayKey);
  // Le streak est encore actif si la dernière activité était aujourd'hui ou hier
  // (l'utilisateur a jusqu'à la fin de la journée pour le maintenir).
  if (gapFromToday > 1) return { current: 0, best };

  let current = 1;
  for (let i = days.length - 1; i > 0; i--) {
    if (dayDiff(days[i - 1], days[i]) === 1) current += 1;
    else break;
  }
  return { current, best: Math.max(best, current) };
}

export type ActivityWindow = {
  completedCount: number;
  postponedCount: number;
  blockedCount: number;
  abandonedCount: number;
  activeDaysCount: number;
  windowDays: number;
};

/** Discipline (§23) : actions terminées + régularité — pas juste le volume. */
export function computeDisciplineScore(window: ActivityWindow): number {
  const totalActed = window.completedCount + window.postponedCount + window.blockedCount + window.abandonedCount;
  const completionRate = totalActed === 0 ? 0 : window.completedCount / totalActed;
  const regularity = window.windowDays === 0 ? 0 : window.activeDaysCount / window.windowDays;
  return Math.round((completionRate * 0.6 + regularity * 0.4) * 100);
}

/** Constance (§23) : activité récente + jours actifs + streak, pas anxiogène (dégradation progressive, pas de chute brutale). */
export function computeConstanceScore(params: {
  activeDays30: number;
  streakCurrent: number;
  daysSinceLastActive: number;
}): number {
  const regularity30 = Math.min(1, params.activeDays30 / 30);
  const streakFactor = Math.min(1, params.streakCurrent / 14);
  const recencyPenalty = Math.min(1, params.daysSinceLastActive / 10);
  const score = regularity30 * 0.45 + streakFactor * 0.35 + (1 - recencyPenalty) * 0.2;
  return Math.round(Math.max(0, Math.min(1, score)) * 100);
}

/**
 * Momentum (§24) : dynamique récente, descend progressivement en cas
 * d'inactivité (décroissance graduelle via `decay`, jamais une chute à 0 du
 * jour au lendemain) — encourage la continuité sans punir brutalement.
 */
export function computeMomentum(params: {
  completedLast7: number;
  activeDays7: number;
  postponedLast7: number;
  streakCurrent: number;
  daysSinceLastActive: number;
}): number {
  const activity = params.completedLast7 * 8 + params.activeDays7 * 6 + Math.min(params.streakCurrent, 14) * 2;
  const friction = params.postponedLast7 * 4;
  const raw = activity - friction;
  const decay = Math.max(0, 1 - params.daysSinceLastActive * 0.12);
  return Math.round(Math.max(0, Math.min(100, raw * decay)));
}

export type MomentumLabel = "aucune_activite" | "reprise" | "bon_rythme" | "tres_forte_dynamique";

export function momentumLabel(momentum: number): MomentumLabel {
  if (momentum <= 5) return "aucune_activite";
  if (momentum < 35) return "reprise";
  if (momentum < 70) return "bon_rythme";
  return "tres_forte_dynamique";
}
