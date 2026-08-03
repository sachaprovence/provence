/**
 * Analyseur cron (Automation Engine, v0.8) — surensemble volontaire de
 * `src/lib/workflows/triggers/cron.ts` (v0.6, ADR 0021), qui reste
 * inchangé (aucune régression possible sur le Workflow Engine) : ce
 * nouveau moteur, autonome, ajoute les plages (`a-b`) et les alias
 * courants (`@yearly`, `@monthly`, `@weekly`, `@daily`, `@hourly`...) —
 * exactement les extensions qu'ADR 0021 anticipait explicitement comme
 * "ajoutables plus tard si un besoin réel se présente". Il coexiste avec
 * l'analyseur existant plutôt que de le remplacer, car son évaluation
 * "champs" (`matchesCronFields`) doit pouvoir être appelée avec des champs
 * calculés dans un fuseau horaire arbitraire (voir `timezone.ts`), une
 * différence de nature avec l'évaluateur UTC-only existant — voir ADR 0036.
 */

const CRON_ALIASES: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

function parseField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>();
  for (const part of field.split(",")) {
    const match = part.match(/^(\*|\d+|\d+-\d+)(?:\/(\d+))?$/);
    if (!match) throw new Error(`Champ cron invalide : "${part}".`);
    const [, base, stepStr] = match;
    const step = stepStr ? Number(stepStr) : 1;

    if (base === "*") {
      for (let value = min; value <= max; value += step) values.add(value);
    } else if (base.includes("-")) {
      const [startStr, endStr] = base.split("-");
      const start = Number(startStr);
      const end = Number(endStr);
      if (start > end || start < min || end > max) throw new Error(`Plage cron invalide : "${base}".`);
      for (let value = start; value <= end; value += step) values.add(value);
    } else {
      const value = Number(base);
      if (value < min || value > max) throw new Error(`Valeur cron hors bornes : "${base}".`);
      if (stepStr) {
        for (let v = value; v <= max; v += step) values.add(v);
      } else {
        values.add(value);
      }
    }
  }
  return values;
}

export type ParsedCronExpression = {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  daysOfMonthWildcard: boolean;
  daysOfWeekWildcard: boolean;
};

export function parseCronExpression(expression: string): ParsedCronExpression {
  const trimmed = expression.trim();
  const normalized = CRON_ALIASES[trimmed] ?? trimmed;
  const fields = normalized.split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Expression cron invalide (5 champs, ou un alias "@..." connu, attendus) : "${expression}".`);
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

export type CronFields = { minute: number; hour: number; dayOfMonth: number; month: number; dayOfWeek: number };

/** Même sémantique POSIX que `workflows/triggers/cron.ts#matchesCron` (combinaison OU si jour-du-mois et jour-de-semaine sont tous deux restreints) — mais opère sur des champs déjà extraits, pour rester indépendant du fuseau horaire de calcul (voir `timezone.ts`). */
export function matchesCronFields(parsed: ParsedCronExpression, fields: CronFields): boolean {
  if (!parsed.minutes.has(fields.minute)) return false;
  if (!parsed.hours.has(fields.hour)) return false;
  if (!parsed.months.has(fields.month)) return false;

  const domMatch = parsed.daysOfMonth.has(fields.dayOfMonth);
  const dowMatch = parsed.daysOfWeek.has(fields.dayOfWeek);
  if (!parsed.daysOfMonthWildcard && !parsed.daysOfWeekWildcard) return domMatch || dowMatch;
  return domMatch && dowMatch;
}
