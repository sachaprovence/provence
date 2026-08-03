import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { GmailEmailProvider } from "@/lib/email/providers/gmail";
import { getGmailAuthorizationUrl, completeGmailOAuthFlow } from "@/lib/email/providers/gmail-oauth-flow";
import { ValidationError } from "@/lib/errors";
import type { OutboundEmail } from "@/lib/email/types";

/**
 * Fournisseur Gmail réel (v0.9 bis, AR-0053) — API Gmail v1 + OAuth2
 * partagé avec Google Calendar (`src/lib/google/oauth.ts`). Mêmes
 * conventions que `tests/email/real-providers.test.ts` /
 * `tests/calendar/google-calendar.test.ts` : échec explicite sans
 * configuration, envoi réel vérifié contre un vrai serveur HTTP local
 * (jamais un succès simulé).
 */

function baseEmail(organizationId: string, overrides: Partial<OutboundEmail> = {}): OutboundEmail {
  return {
    fromName: "Provence 360",
    fromEmail: "contact@provence360.test",
    toEmail: "client@example.test",
    subject: "Bonjour",
    body: "<p>Contenu</p>",
    organizationId,
    messageId: "test-message",
    ...overrides,
  };
}

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("GmailEmailProvider — échec explicite sans configuration", () => {
  const organizationIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  it("échoue explicitement (jamais un succès simulé) sans clientId/clientSecret/refreshToken", async () => {
    const organization = await prisma.organization.create({ data: { name: "Org gmail non configuré" } });
    organizationIds.push(organization.id);

    const result = await new GmailEmailProvider().send(baseEmail(organization.id));
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/non configuré/);
  });
});

runIfDatabase("GmailEmailProvider — envoi réel contre un vrai serveur HTTP local simulant Google", () => {
  const organizationIds: string[] = [];
  let server: http.Server;
  let baseUrl: string;
  let requestLog: { url: string; method: string; headers: http.IncomingHttpHeaders; body: string }[] = [];
  let nextTokenStatus = 200;
  let nextSendStatus = 200;

  async function createOrgWithGmailConfig(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org gmail ${suffix}` } });
    organizationIds.push(organization.id);
    await prisma.integration.create({
      data: {
        organizationId: organization.id,
        kind: "EMAIL",
        name: "Gmail",
        status: "CONNECTED",
        config: { clientId: "client-1", clientSecret: "secret-1", refreshToken: "rt-1", oauthBaseUrl: baseUrl, apiBaseUrl: baseUrl } as never,
      },
    });
    return organization;
  }

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        requestLog.push({ url: req.url ?? "", method: req.method ?? "", headers: req.headers, body });

        if (req.url === "/token") {
          res.writeHead(nextTokenStatus, { "Content-Type": "application/json" });
          res.end(nextTokenStatus === 200 ? JSON.stringify({ access_token: "at-1", expires_in: 3600, token_type: "Bearer" }) : JSON.stringify({ error: "invalid_grant" }));
          return;
        }
        if (req.url === "/users/me/messages/send") {
          res.writeHead(nextSendStatus, { "Content-Type": "application/json" });
          res.end(nextSendStatus === 200 ? JSON.stringify({ id: "gmail-msg-1", threadId: "thread-1" }) : JSON.stringify({ error: "insufficient permissions" }));
          return;
        }
        res.writeHead(404);
        res.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  afterEach(() => {
    requestLog = [];
    nextTokenStatus = 200;
    nextSendStatus = 200;
  });

  it("envoie réellement un email (refresh du jeton puis POST users/me/messages/send)", async () => {
    const organization = await createOrgWithGmailConfig("send-ok");
    const result = await new GmailEmailProvider().send(baseEmail(organization.id));

    expect(result.status).toBe("sent");
    expect(result.providerMessageId).toBe("gmail-msg-1");
    expect(requestLog).toHaveLength(2);
    expect(requestLog[0].url).toBe("/token");
    expect(requestLog[0].body).toContain("grant_type=refresh_token");
    expect(requestLog[1].url).toBe("/users/me/messages/send");
    expect(requestLog[1].headers.authorization).toBe("Bearer at-1");

    const sentRaw = JSON.parse(requestLog[1].body).raw as string;
    const decoded = Buffer.from(sentRaw, "base64").toString("utf-8");
    expect(decoded).toContain("To: client@example.test");
    expect(decoded).toContain("Subject: Bonjour");
    expect(decoded).toContain("<p>Contenu</p>");
  });

  it("une erreur HTTP lors de l'envoi est reportée comme un échec explicite (jamais un succès)", async () => {
    nextSendStatus = 403;
    const organization = await createOrgWithGmailConfig("send-error");
    const result = await new GmailEmailProvider().send(baseEmail(organization.id));
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/403/);
  });

  it("un échec du renouvellement du jeton (refresh_token invalide) est reporté comme un échec explicite", async () => {
    nextTokenStatus = 400;
    const organization = await createOrgWithGmailConfig("refresh-error");
    const result = await new GmailEmailProvider().send(baseEmail(organization.id));
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/400/);
  });
});

runIfDatabase("Gmail — flux OAuth (config par organisation)", () => {
  const organizationIds: string[] = [];
  const originalRedirectUri = process.env.GMAIL_OAUTH_REDIRECT_URI;

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    if (originalRedirectUri) process.env.GMAIL_OAUTH_REDIRECT_URI = originalRedirectUri;
    else delete process.env.GMAIL_OAUTH_REDIRECT_URI;
  });

  it("getGmailAuthorizationUrl rejette si aucun clientId n'est configuré", async () => {
    const organization = await prisma.organization.create({ data: { name: "Org gmail no client id" } });
    organizationIds.push(organization.id);
    await expect(getGmailAuthorizationUrl(organization.id)).rejects.toThrow(ValidationError);
  });

  it("getGmailAuthorizationUrl construit une URL de consentement avec le scope gmail.send", async () => {
    const organization = await prisma.organization.create({ data: { name: "Org gmail client id" } });
    organizationIds.push(organization.id);
    await prisma.integration.create({
      data: { organizationId: organization.id, kind: "EMAIL", name: "Gmail", status: "DISCONNECTED", config: { clientId: "client-1" } as never },
    });
    process.env.GMAIL_OAUTH_REDIRECT_URI = "https://app.test/callback/gmail";

    const url = await getGmailAuthorizationUrl(organization.id);
    const parsed = new URL(url);
    expect(parsed.searchParams.get("client_id")).toBe("client-1");
    expect(parsed.searchParams.get("scope")).toContain("gmail.send");
    expect(parsed.searchParams.get("state")).toBe(organization.id);
  });

  it("completeGmailOAuthFlow rejette explicitement si Google ne renvoie aucun refresh_token", async () => {
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

    const organization = await prisma.organization.create({ data: { name: "Org gmail no refresh token" } });
    organizationIds.push(organization.id);
    await prisma.integration.create({
      data: {
        organizationId: organization.id,
        kind: "EMAIL",
        name: "Gmail",
        status: "DISCONNECTED",
        config: { clientId: "c", clientSecret: "s", oauthBaseUrl } as never,
      },
    });
    process.env.GMAIL_OAUTH_REDIRECT_URI = "https://app.test/callback/gmail";

    await expect(completeGmailOAuthFlow(organization.id, "code")).rejects.toThrow(/refresh_token/);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("completeGmailOAuthFlow persiste le refresh_token dans Integration.config (kind EMAIL)", async () => {
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ access_token: "at", refresh_token: "rt-stored", expires_in: 3600, token_type: "Bearer" }));
        void body;
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const oauthBaseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const organization = await prisma.organization.create({ data: { name: "Org gmail flow complet" } });
    organizationIds.push(organization.id);
    await prisma.integration.create({
      data: {
        organizationId: organization.id,
        kind: "EMAIL",
        name: "Gmail",
        status: "DISCONNECTED",
        config: { clientId: "c", clientSecret: "s", oauthBaseUrl } as never,
      },
    });
    process.env.GMAIL_OAUTH_REDIRECT_URI = "https://app.test/callback/gmail";

    await completeGmailOAuthFlow(organization.id, "auth-code");

    const integration = await prisma.integration.findFirstOrThrow({ where: { organizationId: organization.id, kind: "EMAIL" } });
    expect(integration.status).toBe("CONNECTED");
    expect((integration.config as { refreshToken?: string }).refreshToken).toBe("rt-stored");

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
