/**
 * Analyseur cron minimal (5 champs standard : minute heure jour-du-mois
 * mois jour-de-semaine), supportant l'astérisque, les listes séparées par
 * virgule, et le pas "étoile-slash-n" (ex. toutes les 15 minutes) —
 * suffisant pour la quasi-totalité des besoins de planification réels,
 * sans dépendance externe. Contrairement à la simplification
 * documentée de `AgentSchedule` (v0.3, report fixe d'une heure), le
 * Workflow Engine évalue une vraie expression cron : voir ADR 0021 pour la
 * justification de ce choix plus coûteux mais plus honnête ici.
 *
 * Non supporté délibérément : plages `a-b`, alias (`@daily`), noms de mois
 * / jours en toutes lettres — à ajouter si un besoin réel se présente,
 * sans changer la signature de `matchesCron`/`getNextCronRun`.
 */

function parseField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>();
  for (const part of field.split(",")) {
    const stepMatch = part.match(/^(\*|\d+)(?:\/(\d+))?$/);
    if (!stepMatch) throw new Error(`Champ cron invalide : "${part}".`);
    const [, base, stepStr] = stepMatch;
    const step = stepStr ? Number(stepStr) : 1;
    const start = base === "*" ? min : Number(base);
    for (let value = start; value <= max; value += step) {
      values.add(value);
      if (base !== "*" && !stepStr) break; // valeur exacte unique, pas de pas
    }
  }
  return values;
}

type ParsedCron = {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  daysOfMonthWildcard: boolean;
  daysOfWeekWildcard: boolean;
};

export function parseCronExpression(expression: string): ParsedCron {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Expression cron invalide (5 champs attendus) : "${expression}".`);
  }
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  return {
    minutes: parseField(minute, 0, 59),
    hours: parseField(hour, 0, 23),
    daysOfMonth: parseField(dayOfMonth, 1, 31),
    months: parseField(month, 1, 12),
    daysOfWeek: parseField(dayOfWeek, 0, 6),
    daysOfMonthWildcard: dayOfMonth.trim() === "*",
    daysOfWeekWildcard: dayOfWeek.trim() === "*",
  };
}

export function matchesCron(expression: string, date: Date): boolean {
  const parsed = parseCronExpression(expression);
  if (!parsed.minutes.has(date.getUTCMinutes())) return false;
  if (!parsed.hours.has(date.getUTCHours())) return false;
  if (!parsed.months.has(date.getUTCMonth() + 1)) return false;

  const domMatch = parsed.daysOfMonth.has(date.getUTCDate());
  const dowMatch = parsed.daysOfWeek.has(date.getUTCDay());
  // Sémantique POSIX standard : si les deux champs jour sont restreints, on les combine en OU.
  if (!parsed.daysOfMonthWildcard && !parsed.daysOfWeekWildcard) return domMatch || dowMatch;
  return domMatch && dowMatch;
}

const MAX_LOOKAHEAD_MINUTES = 366 * 24 * 60;

/** Balayage minute par minute (borné à un an) — correct et amplement suffisant pour un usage de planification, sans bibliothèque de calcul cron. */
export function getNextCronRun(expression: string, after: Date): Date | null {
  const candidate = new Date(after.getTime());
  candidate.setUTCSeconds(0, 0);
  candidate.setTime(candidate.getTime() + 60_000);
  for (let i = 0; i < MAX_LOOKAHEAD_MINUTES; i += 1) {
    if (matchesCron(expression, candidate)) return new Date(candidate.getTime());
    candidate.setTime(candidate.getTime() + 60_000);
  }
  return null;
}
