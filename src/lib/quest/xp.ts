import { QuestType } from "@/generated/prisma/enums";

/**
 * Système XP (§25-26 du brief) — volontairement simple : une base par type
 * de quête, un léger multiplicateur selon la difficulté réelle déclarée
 * (1-5), jamais un système RPG à stats multiples. Les BOSS sont en plus
 * mis à l'échelle par `impactWeight` (un jalon majeur rapporte plus).
 */
const BASE_XP_BY_TYPE: Record<QuestType, number> = {
  MICRO: 10,
  SHORT: 20,
  NORMAL: 40,
  DEEP: 80,
  HABIT: 15,
  CHALLENGE: 80,
  BOSS: 150,
};

const BOSS_MAX_XP = 500;

/** Multiplicateur léger : difficulté 1 → 0.8x, difficulté 3 (par défaut) → 1x, difficulté 5 → 1.2x. */
function difficultyMultiplier(difficulty: number): number {
  const clamped = Math.max(1, Math.min(5, difficulty));
  return 0.8 + (clamped - 1) * 0.1;
}

export function computeXpReward(params: { type: QuestType; difficulty: number; impactWeight?: number }): number {
  const base = BASE_XP_BY_TYPE[params.type];
  const raw = base * difficultyMultiplier(params.difficulty);
  if (params.type === "BOSS") {
    const impact = Math.max(1, params.impactWeight ?? 1);
    return Math.round(Math.min(BOSS_MAX_XP, raw * Math.min(impact, 3)));
  }
  return Math.round(raw);
}

/**
 * Courbe de niveau (§26 du brief) : XP requis pour passer du niveau `level`
 * au suivant croît de façon supra-linéaire (un niveau 10 demande nettement
 * plus qu'un niveau 2), sans complexité inutile — une seule formule, testée.
 */
export function xpRequiredForLevel(level: number): number {
  return Math.round(100 * Math.pow(Math.max(1, level), 1.35));
}

export type LevelProgress = {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
};

export function computeLevelProgress(xpTotal: number): LevelProgress {
  let level = 1;
  let remaining = Math.max(0, xpTotal);
  let required = xpRequiredForLevel(level);
  while (remaining >= required) {
    remaining -= required;
    level += 1;
    required = xpRequiredForLevel(level);
  }
  return { level, xpIntoLevel: remaining, xpForNextLevel: required };
}
