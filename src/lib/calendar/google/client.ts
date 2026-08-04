import "server-only";
import type { CalendarEventInput, CalendarEventResult, FreeBusySlot } from "./types";

const DEFAULT_API_BASE_URL = "https://www.googleapis.com/calendar/v3";

interface GoogleEventResponse {
  id: string;
  htmlLink?: string;
}

/** Client Google Calendar v3 minimal (create/update/delete/freeBusy), lié à un jeton d'accès déjà valide. */
export class GoogleCalendarClient {
  constructor(
    private readonly accessToken: string,
    private readonly calendarId: string,
    private readonly apiBaseUrl: string = DEFAULT_API_BASE_URL
  ) {}

  private headers() {
    return { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json" };
  }

  private toGoogleEventBody(event: CalendarEventInput) {
    return {
      summary: event.summary,
      description: event.description,
      location: event.location,
      start: { dateTime: event.startAt.toISOString() },
      end: { dateTime: event.endAt.toISOString() },
      attendees: event.attendeeEmails?.map((email) => ({ email })),
      reminders:
        event.reminderMinutesBefore !== undefined
          ? { useDefault: false, overrides: [{ method: "popup", minutes: event.reminderMinutesBefore }] }
          : undefined,
    };
  }

  async createEvent(event: CalendarEventInput): Promise<CalendarEventResult> {
    const response = await fetch(`${this.apiBaseUrl}/calendars/${encodeURIComponent(this.calendarId)}/events?sendUpdates=all`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(this.toGoogleEventBody(event)),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Création de l'évènement Google Calendar échouée (${response.status}) : ${body.slice(0, 300)}`);
    }
    const data = (await response.json()) as GoogleEventResponse;
    return { googleEventId: data.id, htmlLink: data.htmlLink };
  }

  async updateEvent(googleEventId: string, event: CalendarEventInput): Promise<CalendarEventResult> {
    const response = await fetch(
      `${this.apiBaseUrl}/calendars/${encodeURIComponent(this.calendarId)}/events/${encodeURIComponent(googleEventId)}?sendUpdates=all`,
      { method: "PATCH", headers: this.headers(), body: JSON.stringify(this.toGoogleEventBody(event)) }
    );
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Mise à jour de l'évènement Google Calendar échouée (${response.status}) : ${body.slice(0, 300)}`);
    }
    const data = (await response.json()) as GoogleEventResponse;
    return { googleEventId: data.id, htmlLink: data.htmlLink };
  }

  async deleteEvent(googleEventId: string): Promise<void> {
    const response = await fetch(
      `${this.apiBaseUrl}/calendars/${encodeURIComponent(this.calendarId)}/events/${encodeURIComponent(googleEventId)}?sendUpdates=all`,
      { method: "DELETE", headers: this.headers() }
    );
    // 404/410 = déjà supprimé côté Google — pas une erreur pour l'appelant (idempotent).
    if (!response.ok && response.status !== 404 && response.status !== 410) {
      const body = await response.text().catch(() => "");
      throw new Error(`Suppression de l'évènement Google Calendar échouée (${response.status}) : ${body.slice(0, 300)}`);
    }
  }

  async freeBusy(timeMinIso: string, timeMaxIso: string): Promise<FreeBusySlot[]> {
    const response = await fetch(`${this.apiBaseUrl}/freeBusy`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ timeMin: timeMinIso, timeMax: timeMaxIso, items: [{ id: this.calendarId }] }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Lecture des disponibilités Google Calendar échouée (${response.status}) : ${body.slice(0, 300)}`);
    }
    const data = (await response.json()) as { calendars: Record<string, { busy: FreeBusySlot[] }> };
    return data.calendars[this.calendarId]?.busy ?? [];
  }
}
