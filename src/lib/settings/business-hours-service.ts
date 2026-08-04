import "server-only";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";

/**
 * Paramètres d'agenda (v1.1, AR-0179) — horaires d'ouverture par jour de la
 * semaine et capacité par créneau, consommés par
 * `src/lib/agents/tools/planning-tools.ts#suggestSlotsTool` pour ne
 * proposer que des créneaux réellement disponibles. Absence de ligne
 * `BusinessHours` pour un jour donné = aucune restriction d'horaire pour ce
 * jour (comportement inchangé pour les organisations qui n'ont rien
 * configuré). Horaires exprimés en UTC ("HH:mm") — aucune conversion de
 * fuseau horaire par organisation (simplification assumée).
 */

export interface DayHours {
  dayOfWeek: number;
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
}

export interface BusinessHoursConfig {
  appointmentSlotCapacity: number;
  /** Toujours 7 entrées (dimanche=0 à samedi=6), une par jour, valeurs par défaut (ouvert, sans restriction) si non configuré. */
  hours: DayHours[];
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function validateTime(value: string, field: string) {
  if (!TIME_PATTERN.test(value)) {
    throw new ValidationError(`${field} doit être au format "HH:mm" (ex. "09:00").`);
  }
}

export async function getBusinessHoursConfig(organizationId: string): Promise<BusinessHoursConfig> {
  const [organization, rows] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { appointmentSlotCapacity: true } }),
    prisma.businessHours.findMany({ where: { organizationId }, orderBy: { dayOfWeek: "asc" } }),
  ]);

  const byDay = new Map(rows.map((row) => [row.dayOfWeek, row]));
  const hours: DayHours[] = Array.from({ length: 7 }, (_, dayOfWeek) => {
    const row = byDay.get(dayOfWeek);
    return row
      ? { dayOfWeek, isOpen: row.isOpen, opensAt: row.opensAt, closesAt: row.closesAt }
      : { dayOfWeek, isOpen: true, opensAt: null, closesAt: null };
  });

  return { appointmentSlotCapacity: organization.appointmentSlotCapacity, hours };
}

export async function updateBusinessHours(
  organizationId: string,
  data: { appointmentSlotCapacity?: number; hours: { dayOfWeek: number; isOpen: boolean; opensAt?: string | null; closesAt?: string | null }[] }
): Promise<BusinessHoursConfig> {
  for (const day of data.hours) {
    if (day.dayOfWeek < 0 || day.dayOfWeek > 6) {
      throw new ValidationError("dayOfWeek doit être compris entre 0 (dimanche) et 6 (samedi).");
    }
    if (day.isOpen && day.opensAt && day.closesAt) {
      validateTime(day.opensAt, "opensAt");
      validateTime(day.closesAt, "closesAt");
      if (day.opensAt >= day.closesAt) {
        throw new ValidationError("opensAt doit être avant closesAt.");
      }
    }
  }
  if (data.appointmentSlotCapacity !== undefined && data.appointmentSlotCapacity < 1) {
    throw new ValidationError("appointmentSlotCapacity doit être au moins 1.");
  }

  await prisma.$transaction([
    ...(data.appointmentSlotCapacity !== undefined
      ? [prisma.organization.update({ where: { id: organizationId }, data: { appointmentSlotCapacity: data.appointmentSlotCapacity } })]
      : []),
    ...data.hours.map((day) =>
      prisma.businessHours.upsert({
        where: { organizationId_dayOfWeek: { organizationId, dayOfWeek: day.dayOfWeek } },
        update: { isOpen: day.isOpen, opensAt: day.isOpen ? day.opensAt ?? null : null, closesAt: day.isOpen ? day.closesAt ?? null : null },
        create: {
          organizationId,
          dayOfWeek: day.dayOfWeek,
          isOpen: day.isOpen,
          opensAt: day.isOpen ? day.opensAt ?? null : null,
          closesAt: day.isOpen ? day.closesAt ?? null : null,
        },
      })
    ),
  ]);

  return getBusinessHoursConfig(organizationId);
}

/**
 * Vrai si l'intervalle [start, end) tombe ENTIÈREMENT dans les horaires
 * d'ouverture configurés pour son jour (UTC) — un jour absent de `hours`
 * ne devrait jamais arriver (`getBusinessHoursConfig` renvoie toujours les
 * 7 jours), mais reste "ouvert par défaut" par sécurité. Un jour fermé
 * (`isOpen: false`) rejette tout créneau. Sans `opensAt`/`closesAt` fixés
 * sur un jour ouvert, aucune restriction horaire ne s'applique.
 */
export function isWithinBusinessHours(hours: DayHours[], start: Date, end: Date): boolean {
  const dayOfWeek = start.getUTCDay();
  const day = hours.find((h) => h.dayOfWeek === dayOfWeek);
  if (!day) return true;
  if (!day.isOpen) return false;
  if (!day.opensAt || !day.closesAt) return true;

  // Un créneau qui déborde sur le jour suivant (ex. 23h30-00h30) est refusé par simplicité — voir limitation UTC ci-dessus.
  if (start.getUTCDay() !== end.getUTCDay() && !(end.getUTCHours() === 0 && end.getUTCMinutes() === 0)) return false;

  const toMinutes = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  };
  const startMinutes = start.getUTCHours() * 60 + start.getUTCMinutes();
  const endMinutesRaw = end.getUTCHours() * 60 + end.getUTCMinutes();
  const endMinutes = end.getUTCDay() !== start.getUTCDay() ? 24 * 60 : endMinutesRaw;

  return startMinutes >= toMinutes(day.opensAt) && endMinutes <= toMinutes(day.closesAt);
}
