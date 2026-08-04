import "server-only";
import { prisma } from "@/lib/prisma";
import { NotificationChannel } from "@/generated/prisma/enums";

/**
 * Préférences de notification par utilisateur (v1.1, AR-0180) — canal
 * (application/email) x évènement, consommées par `notification.create`
 * (Automation Engine ET Workflow Engine, voir les deux
 * `notification-action.ts`) avant d'émettre une notification applicative
 * réelle. Absence de ligne pour une combinaison donnée = activé par défaut
 * (comportement inchangé pour tout utilisateur qui n'a rien configuré).
 */

/** Catalogue des évènements exposés dans les réglages — sous-ensemble des évènements RÉELLEMENT émis par l'Automation Engine (voir `trigger-engine.ts#REAL_EMISSION_EVENT_KEYS`), jamais un évènement inventé. */
export const NOTIFICATION_PREFERENCE_EVENTS = [
  { key: "lead.created", label: "Nouveau prospect créé" },
  { key: "quote.signed", label: "Devis signé" },
  { key: "invoice.paid", label: "Paiement reçu" },
  { key: "invoice.overdue", label: "Facture en retard" },
] as const;

export type NotificationPreferenceEventKey = (typeof NOTIFICATION_PREFERENCE_EVENTS)[number]["key"];

export interface NotificationPreferenceRow {
  eventKey: string;
  channel: NotificationChannel;
  enabled: boolean;
}

export async function getNotificationPreferences(userId: string): Promise<NotificationPreferenceRow[]> {
  const rows = await prisma.notificationPreference.findMany({ where: { userId } });
  const byKey = new Map(rows.map((row) => [`${row.eventKey}:${row.channel}`, row.enabled]));

  const result: NotificationPreferenceRow[] = [];
  for (const event of NOTIFICATION_PREFERENCE_EVENTS) {
    for (const channel of [NotificationChannel.APP, NotificationChannel.EMAIL]) {
      result.push({ eventKey: event.key, channel, enabled: byKey.get(`${event.key}:${channel}`) ?? true });
    }
  }
  return result;
}

export async function updateNotificationPreferences(
  organizationId: string,
  userId: string,
  preferences: { eventKey: string; channel: NotificationChannel; enabled: boolean }[]
): Promise<NotificationPreferenceRow[]> {
  await prisma.$transaction(
    preferences.map((pref) =>
      prisma.notificationPreference.upsert({
        where: { userId_eventKey_channel: { userId, eventKey: pref.eventKey, channel: pref.channel } },
        update: { enabled: pref.enabled },
        create: { organizationId, userId, eventKey: pref.eventKey, channel: pref.channel, enabled: pref.enabled },
      })
    )
  );
  return getNotificationPreferences(userId);
}

/** Vrai par défaut (aucune restriction) tant qu'aucune préférence n'a été explicitement désactivée. */
export async function isNotificationEnabled(userId: string, eventKey: string, channel: NotificationChannel): Promise<boolean> {
  const preference = await prisma.notificationPreference.findUnique({
    where: { userId_eventKey_channel: { userId, eventKey, channel } },
  });
  return preference?.enabled ?? true;
}
