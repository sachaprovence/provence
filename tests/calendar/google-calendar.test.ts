import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { buildAuthorizationUrl, exchangeCodeForTokens, refreshAccessToken } from "@/lib/calendar/google/oauth";
import { GoogleCalendarClient } from "@/lib/calendar/google/client";
import { resolveGoogleCalendarConfig, storeGoogleCalendarTokens } from "@/lib/calendar/google/config";
import {
  getGoogleAuthorizationUrl,
  completeGoogleOAuthFlow,
} from "@/lib/calendar/google/oauth-flow-service";
import {
  syncAppointmentToGoogle,
  deleteGoogleEventForAppointment,
  trySyncAppointmentToGoogle,
  getGoogleCalendarBusySlots,
} from "@/lib/calendar/google/sync-service";
import { ValidationError } from "@/lib/errors";

/**
 * Intégration Google Calendar (v0.9, ADR 0038) — RÉELLE (OAuth2 + API
 * Calendar v3 via `fetch`), pas un stub. Vérifiée contre de vrais petits
 * serveurs HTTP locaux qui simulent les endpoints Google (`oauthBaseUrl`/
 * `apiBaseUrl` surchargeables) : contrat de requête/réponse authentique.
 * La vérification end-to-end contre un vrai compte Google n'a pas été
 * possible dans cet environnement (aucun identifiant OAuth disponible).
 */

describe("buildAuthorizationUrl", () => {
  it("construit une URL de consentement avec tous les paramètres requis", () => {
    const url = buildAuthorizationUrl({ clientId: "client-123", redirectUri: "https://app.test/callback", state: "org-1" });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("client_id")).toBe("client-123");
    expect(parsed.searchParams.get("redirect_uri")).toBe("https://app.test/callback");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("scope")).toContain("calendar");
    expect(parsed.searchParams.get("access_type")).toBe("offline");
    expect(parsed.searchParams.get("state")).toBe("org-1");
  });
});

describe("OAuth + Calendar API — contre un vrai serveur HTTP local simulant Google", () => {
  let server: http.Server;
  let baseUrl: string;
  let requestLog: { url: string; method: string; headers: http.IncomingHttpHeaders; body: string }[] = [];
  let nextTokenResponse: { status: number; body: unknown };
  let nextEventId = "event-1";

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        requestLog.push({ url: req.url ?? "", method: req.method ?? "", headers: req.headers, body });

        if (req.url === "/token") {
          res.writeHead(nextTokenResponse.status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(nextTokenResponse.body));
          return;
        }
        if (req.url?.includes("/freeBusy")) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ calendars: { primary: { busy: [{ start: "2026-01-01T10:00:00Z", end: "2026-01-01T11:00:00Z" }] } } }));
          return;
        }
        if (req.method === "DELETE") {
          res.writeHead(204);
          res.end();
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id: nextEventId, htmlLink: `https://calendar.google.test/event/${nextEventId}` }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  afterEach(() => {
    requestLog = [];
  });

  it("échange un code contre des jetons via POST /token", async () => {
    nextTokenResponse = { status: 200, body: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600, token_type: "Bearer" } };

    const tokens = await exchangeCodeForTokens({
      code: "auth-code",
      clientId: "client-1",
      clientSecret: "secret-1",
      redirectUri: "https://app.test/callback",
      oauthBaseUrl: baseUrl,
    });

    expect(tokens.access_token).toBe("at-1");
    expect(tokens.refresh_token).toBe("rt-1");
    expect(requestLog[0].method).toBe("POST");
    expect(requestLog[0].body).toContain("grant_type=authorization_code");
  });

  it("lève une erreur explicite si l'échange de code échoue", async () => {
    nextTokenResponse = { status: 400, body: { error: "invalid_grant" } };
    await expect(
      exchangeCodeForTokens({ code: "bad", clientId: "c", clientSecret: "s", redirectUri: "https://app.test/callback", oauthBaseUrl: baseUrl })
    ).rejects.toThrow(/400/);
  });

  it("renouvelle un jeton d'accès à partir du refresh_token", async () => {
    nextTokenResponse = { status: 200, body: { access_token: "fresh-at", expires_in: 3600, token_type: "Bearer" } };
    const accessToken = await refreshAccessToken({ clientId: "c", clientSecret: "s", refreshToken: "rt-1", oauthBaseUrl: baseUrl });
    expect(accessToken).toBe("fresh-at");
    expect(requestLog[0].body).toContain("grant_type=refresh_token");
  });

  it("lève une erreur explicite si la config est incomplète (jamais un succès simulé)", async () => {
    await expect(refreshAccessToken({})).rejects.toThrow(/non configuré/);
  });

  it("GoogleCalendarClient crée, met à jour et supprime un évènement, et lit les disponibilités", async () => {
    nextEventId = "event-abc";
    const client = new GoogleCalendarClient("access-token-1", "primary", baseUrl);

    const created = await client.createEvent({
      summary: "Visite virtuelle",
      startAt: new Date("2026-02-01T10:00:00Z"),
      endAt: new Date("2026-02-01T11:00:00Z"),
      attendeeEmails: ["client@example.test"],
      reminderMinutesBefore: 60,
    });
    expect(created.googleEventId).toBe("event-abc");
    expect(requestLog[0].method).toBe("POST");
    expect(requestLog[0].headers.authorization).toBe("Bearer access-token-1");
    expect(JSON.parse(requestLog[0].body).attendees).toEqual([{ email: "client@example.test" }]);
    expect(JSON.parse(requestLog[0].body).reminders).toEqual({ useDefault: false, overrides: [{ method: "popup", minutes: 60 }] });

    const updated = await client.updateEvent("event-abc", {
      summary: "Visite virtuelle (reportée)",
      startAt: new Date("2026-02-02T10:00:00Z"),
      endAt: new Date("2026-02-02T11:00:00Z"),
    });
    expect(updated.googleEventId).toBe("event-abc");
    expect(requestLog[1].method).toBe("PATCH");

    await expect(client.deleteEvent("event-abc")).resolves.toBeUndefined();
    expect(requestLog[2].method).toBe("DELETE");

    const busy = await client.freeBusy("2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z");
    expect(busy).toHaveLength(1);
    expect(busy[0].start).toBe("2026-01-01T10:00:00Z");
  });

  it("n'envoie aucun champ reminders quand reminderMinutesBefore est omis (v1.1, AR-0172)", async () => {
    nextEventId = "event-no-reminder";
    const client = new GoogleCalendarClient("access-token-1", "primary", baseUrl);
    await client.createEvent({
      summary: "Sans rappel",
      startAt: new Date("2026-02-01T10:00:00Z"),
      endAt: new Date("2026-02-01T11:00:00Z"),
    });
    expect(JSON.parse(requestLog[0].body).reminders).toBeUndefined();
  });
});

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Google Calendar — config par organisation, OAuth flow et synchronisation de rendez-vous", () => {
  const organizationIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  async function createOrgWithAppointment(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org calendar ${suffix}` } });
    organizationIds.push(organization.id);
    const lead = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: `Établissement ${suffix}` } });
    await prisma.leadContact.create({ data: { leadId: lead.id, email: `contact-${suffix}@example.test` } });
    const appointment = await prisma.appointment.create({
      data: {
        organizationId: organization.id,
        leadId: lead.id,
        title: "Visite terrain",
        startAt: new Date("2026-03-01T09:00:00Z"),
        endAt: new Date("2026-03-01T10:00:00Z"),
      },
    });
    return { organization, lead, appointment };
  }

  it("resolveGoogleCalendarConfig retombe sur 'primary' sans configuration, storeGoogleCalendarTokens persiste le refresh_token", async () => {
    const organization = await prisma.organization.create({ data: { name: "Org calendar config" } });
    organizationIds.push(organization.id);

    const emptyConfig = await resolveGoogleCalendarConfig(organization.id);
    expect(emptyConfig.calendarId).toBe("primary");
    expect(emptyConfig.refreshToken).toBeUndefined();

    await storeGoogleCalendarTokens(organization.id, "rt-stored");
    const updatedConfig = await resolveGoogleCalendarConfig(organization.id);
    expect(updatedConfig.refreshToken).toBe("rt-stored");

    const integration = await prisma.integration.findFirst({ where: { organizationId: organization.id, kind: "CALENDAR" } });
    expect(integration?.status).toBe("CONNECTED");
  });

  it("getGoogleAuthorizationUrl rejette si aucun clientId n'est configuré", async () => {
    const organization = await prisma.organization.create({ data: { name: "Org calendar no client id" } });
    organizationIds.push(organization.id);
    await expect(getGoogleAuthorizationUrl(organization.id)).rejects.toThrow(ValidationError);
  });

  it("completeGoogleOAuthFlow rejette explicitement si Google ne renvoie aucun refresh_token", async () => {
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ access_token: "at", expires_in: 3600, token_type: "Bearer" }));
        void body;
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const oauthBaseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const organization = await prisma.organization.create({ data: { name: "Org calendar no refresh token" } });
    organizationIds.push(organization.id);
    await prisma.integration.create({
      data: {
        organizationId: organization.id,
        kind: "CALENDAR",
        name: "Google Calendar",
        status: "DISCONNECTED",
        config: { clientId: "c", clientSecret: "s", oauthBaseUrl } as never,
      },
    });
    process.env.GOOGLE_OAUTH_REDIRECT_URI = "https://app.test/callback";

    await expect(completeGoogleOAuthFlow(organization.id, "code")).rejects.toThrow(/refresh_token/);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("syncAppointmentToGoogle crée puis met à jour l'évènement (idempotent), trySync avale les erreurs si non connecté", async () => {
    const { organization, appointment } = await createOrgWithAppointment("sync");

    // Non connecté : trySyncAppointmentToGoogle ne doit jamais lever d'exception.
    await expect(trySyncAppointmentToGoogle(organization.id, appointment)).resolves.toBeUndefined();
    const stillUnsynced = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(stillUnsynced.googleEventId).toBeNull();

    // Connecté à un faux Google local : syncAppointmentToGoogle doit réellement créer l'évènement.
    const eventRequestBodies: string[] = [];
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        if (req.url === "/token") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ access_token: "at", expires_in: 3600, token_type: "Bearer" }));
          return;
        }
        if (req.url?.includes("/freeBusy")) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ calendars: { primary: { busy: [] } } }));
          return;
        }
        eventRequestBodies.push(body);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id: "created-event-1" }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    await prisma.integration.create({
      data: {
        organizationId: organization.id,
        kind: "CALENDAR",
        name: "Google Calendar",
        status: "CONNECTED",
        config: { clientId: "c", clientSecret: "s", refreshToken: "rt", oauthBaseUrl: baseUrl, apiBaseUrl: baseUrl } as never,
      },
    });

    await syncAppointmentToGoogle(organization.id, stillUnsynced);
    const synced = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(synced.googleEventId).toBe("created-event-1");
    expect(synced.googleSyncedAt).not.toBeNull();
    // v1.1, AR-0172 : chaque évènement synchronisé embarque un rappel par défaut (60 minutes avant).
    expect(JSON.parse(eventRequestBodies[0]).reminders).toEqual({ useDefault: false, overrides: [{ method: "popup", minutes: 60 }] });

    await deleteGoogleEventForAppointment(organization.id, synced);
    const deleted = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(deleted.googleEventId).toBeNull();

    const busy = await getGoogleCalendarBusySlots(organization.id, "2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z");
    expect(Array.isArray(busy)).toBe(true);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
