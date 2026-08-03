import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { ValidationError } from "@/lib/errors";
import { resolveGoogleCalendarConfig } from "./config";
import { refreshAccessToken } from "./oauth";
import { GoogleCalendarClient } from "./client";
import type { AppointmentModel } from "@/generated/prisma/models";

/**
 * Synchronisation Google Calendar (brief v0.9 : "Synchronisation.
 * Création/Modification/Suppression de rendez-vous. Invitations.
 * Disponibilités.") — chaque appel résout la config + renouvelle un jeton
 * d'accès frais (les jetons d'accès expirent après ~1h, jamais mis en
 * cache ici pour rester simple et toujours valide).
 */
async function getAuthorizedClient(organizationId: string): Promise<GoogleCalendarClient> {
  const config = await resolveGoogleCalendarConfig(organizationId);
  if (!config.clientId || !config.clientSecret || !config.refreshToken) {
    throw new ValidationError(
      "Google Calendar non connecté pour cette organisation : configurez-le dans Paramètres (OAuth Google requis)."
    );
  }

  const accessToken = await refreshAccessToken(config);
  return new GoogleCalendarClient(accessToken, config.calendarId ?? "primary", config.apiBaseUrl);
}

async function getAttendeeEmails(leadId: string): Promise<string[]> {
  const contacts = await prisma.leadContact.findMany({ where: { leadId, email: { not: null } }, select: { email: true } });
  return contacts.map((c) => c.email).filter((email): email is string => Boolean(email));
}

/** Crée ou met à jour l'évènement Google Calendar correspondant à un rendez-vous — idempotent. */
export async function syncAppointmentToGoogle(organizationId: string, appointment: AppointmentModel): Promise<void> {
  const client = await getAuthorizedClient(organizationId);
  const attendeeEmails = await getAttendeeEmails(appointment.leadId);

  const eventInput = {
    summary: appointment.title,
    description: [appointment.notes, appointment.summary].filter(Boolean).join("\n\n") || undefined,
    location: appointment.location ?? undefined,
    startAt: appointment.startAt,
    endAt: appointment.endAt,
    attendeeEmails,
  };

  const result = appointment.googleEventId
    ? await client.updateEvent(appointment.googleEventId, eventInput)
    : await client.createEvent(eventInput);

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { googleEventId: result.googleEventId, googleSyncedAt: new Date() },
  });
}

/** Supprime l'évènement Google Calendar correspondant (ex. rendez-vous annulé) — no-op si jamais synchronisé. */
export async function deleteGoogleEventForAppointment(organizationId: string, appointment: AppointmentModel): Promise<void> {
  if (!appointment.googleEventId) return;
  const client = await getAuthorizedClient(organizationId);
  await client.deleteEvent(appointment.googleEventId);
  await prisma.appointment.update({ where: { id: appointment.id }, data: { googleEventId: null, googleSyncedAt: new Date() } });
}

/** Synchronise "au mieux" : journalise un échec plutôt que de faire échouer la création/modification du rendez-vous. */
export async function trySyncAppointmentToGoogle(organizationId: string, appointment: AppointmentModel): Promise<void> {
  try {
    await syncAppointmentToGoogle(organizationId, appointment);
  } catch (error) {
    logger.warn({ err: error, appointmentId: appointment.id, organizationId }, "Synchronisation Google Calendar non effectuée.");
  }
}

/** Disponibilités (créneaux occupés) sur une période — brief : "Disponibilités". */
export async function getGoogleCalendarBusySlots(organizationId: string, timeMinIso: string, timeMaxIso: string) {
  const client = await getAuthorizedClient(organizationId);
  return client.freeBusy(timeMinIso, timeMaxIso);
}
