/**
 * Calcul d'heure locale par fuseau IANA (Automation Engine, v0.8), sans
 * dépendance externe (`date-fns-tz`, `luxon`...) : `Intl.DateTimeFormat`
 * embarque la base de données de fuseaux horaires d'ICU dans Node.js, y
 * compris les transitions d'heure d'été (DST) — un seul appel par instant
 * donne directement les champs "muraux" corrects pour ce fuseau, sans
 * calcul d'offset manuel ni table de transitions à maintenir.
 */
export type WallClockFields = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timezone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "short",
    });
    formatterCache.set(timezone, formatter);
  }
  return formatter;
}

/** Lève une erreur claire si `timezone` n'est pas un identifiant IANA reconnu par l'environnement — à valider avant stockage (voir Automation Registry). */
export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Champs "muraux" (année/mois/jour/heure/minute/jour de semaine) d'un instant donné, tels qu'observés dans `timezone`. */
export function getWallClockFields(instant: Date, timezone: string): WallClockFields {
  const parts = getFormatter(timezone).formatToParts(instant);
  const byType: Record<string, string> = {};
  for (const part of parts) byType[part.type] = part.value;

  return {
    year: Number(byType.year),
    month: Number(byType.month),
    day: Number(byType.day),
    // Certains moteurs ICU rendent minuit "24" même avec hour12:false.
    hour: byType.hour === "24" ? 0 : Number(byType.hour),
    minute: Number(byType.minute),
    weekday: WEEKDAY_INDEX[byType.weekday],
  };
}
