/**
 * Intégration Google Calendar (brief v0.9 : "Créer l'intégration.
 * Synchronisation. Création/Modification/Suppression de rendez-vous.
 * Invitations. Disponibilités.") — RÉELLE (comme les emails), pas un
 * stub : OAuth2 + API Calendar v3 via `fetch`, sans SDK `googleapis`
 * (cohérent avec les autres intégrations HTTP du projet — LLM, Resend,
 * Postmark, Brevo, webhooks). Voir ADR 0038 : la vérification end-to-end
 * contre un vrai compte Google n'a pas été possible dans cet
 * environnement (aucun identifiant OAuth disponible).
 */

export interface GoogleCalendarConfig {
  clientId?: string;
  clientSecret?: string;
  /** Émis lors du flux OAuth (`completeOAuthFlow`), stocké par organisation. */
  refreshToken?: string;
  /** Calendrier cible — "primary" par défaut. */
  calendarId?: string;
  /** Surcharges pour les tests (jamais utilisées en production). */
  oauthBaseUrl?: string;
  apiBaseUrl?: string;
}

export interface CalendarEventInput {
  summary: string;
  description?: string;
  location?: string;
  startAt: Date;
  endAt: Date;
  attendeeEmails?: string[];
  /** Minutes avant l'évènement pour le rappel (notification popup). Omis = aucun rappel. */
  reminderMinutesBefore?: number;
}

export interface CalendarEventResult {
  googleEventId: string;
  htmlLink?: string;
}

export interface FreeBusySlot {
  start: string;
  end: string;
}
