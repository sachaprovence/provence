/**
 * Enterprise Scheduler (Automation Engine, v0.8) : combine cron (avec
 * plages/alias, `cron-engine.ts`), fuseau horaire + heure d'été
 * (`timezone.ts`), jours ouvrés, jours fériés/exceptions, périodes de
 * blackout et fenêtres d'exécution — le tout évalué à un instant donné
 * sans état, pour rester testable et sans dépendance à un ordonnanceur
 * externe (voir ADR 0036).
 */
import { parseCronExpression, matchesCronFields } from "./cron-engine";
import { getWallClockFields } from "./timezone";

export type BlackoutPeriod = { start: Date; end: Date };
/** Fenêtre quotidienne autorisée, en heure locale du planning (`"HH:mm"`) — une fenêtre dont `endTime < startTime` traverse minuit. */
export type ExecutionWindow = { startTime: string; endTime: string };

export type ScheduleDefinition = {
  cronExpression: string;
  /** Identifiant IANA (ex. `"Europe/Paris"`) — défaut `"UTC"`. */
  timezone?: string;
  /** N'autorise le déclenchement que du lundi au vendredi (heure locale du planning). */
  businessDaysOnly?: boolean;
  /** Dates exclues (`"YYYY-MM-DD"`, dans le fuseau du planning) — jours fériés ou exceptions ponctuelles. */
  holidays?: string[];
  /** Périodes absolues interdites (maintenance, gel de fin d'année...). */
  blackoutPeriods?: BlackoutPeriod[];
  /** Si renseigné, le déclenchement n'a lieu que dans au moins une de ces fenêtres quotidiennes. */
  executionWindows?: ExecutionWindow[];
};

const DEFAULT_TIMEZONE = "UTC";
const MAX_LOOKAHEAD_MINUTES = 366 * 24 * 60;

function isBusinessDay(weekday: number): boolean {
  return weekday >= 1 && weekday <= 5;
}

function dateKey(fields: { year: number; month: number; day: number }): string {
  return `${fields.year}-${String(fields.month).padStart(2, "0")}-${String(fields.day).padStart(2, "0")}`;
}

function isBlackedOut(schedule: ScheduleDefinition, instant: Date): boolean {
  if (!schedule.blackoutPeriods) return false;
  return schedule.blackoutPeriods.some((period) => instant >= period.start && instant < period.end);
}

function parseTimeOfDay(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function isWithinExecutionWindows(schedule: ScheduleDefinition, minutesSinceMidnight: number): boolean {
  if (!schedule.executionWindows || schedule.executionWindows.length === 0) return true;
  return schedule.executionWindows.some((window) => {
    const start = parseTimeOfDay(window.startTime);
    const end = parseTimeOfDay(window.endTime);
    return start <= end
      ? minutesSinceMidnight >= start && minutesSinceMidnight < end
      : minutesSinceMidnight >= start || minutesSinceMidnight < end;
  });
}

/** `true` si `instant` satisfait le cron ET toutes les contraintes de calendrier du planning. */
export function matchesSchedule(schedule: ScheduleDefinition, instant: Date): boolean {
  const timezone = schedule.timezone ?? DEFAULT_TIMEZONE;
  const fields = getWallClockFields(instant, timezone);
  const parsedCron = parseCronExpression(schedule.cronExpression);

  if (
    !matchesCronFields(parsedCron, {
      minute: fields.minute,
      hour: fields.hour,
      dayOfMonth: fields.day,
      month: fields.month,
      dayOfWeek: fields.weekday,
    })
  ) {
    return false;
  }

  if (schedule.businessDaysOnly && !isBusinessDay(fields.weekday)) return false;
  if (schedule.holidays?.includes(dateKey(fields))) return false;
  if (isBlackedOut(schedule, instant)) return false;
  if (!isWithinExecutionWindows(schedule, fields.hour * 60 + fields.minute)) return false;

  return true;
}

/** Balayage minute par minute (borné à un an) — pour l'aperçu (UI) ou une planification ponctuelle, jamais le chemin chaud de déclenchement (voir ADR 0021, même limite assumée). */
export function getNextScheduledRun(schedule: ScheduleDefinition, after: Date): Date | null {
  const candidate = new Date(after.getTime());
  candidate.setUTCSeconds(0, 0);
  candidate.setTime(candidate.getTime() + 60_000);
  for (let i = 0; i < MAX_LOOKAHEAD_MINUTES; i += 1) {
    if (matchesSchedule(schedule, candidate)) return new Date(candidate.getTime());
    candidate.setTime(candidate.getTime() + 60_000);
  }
  return null;
}

export { isValidTimezone } from "./timezone";
