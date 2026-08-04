import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { OutlookEmailProvider } from "@/lib/email/providers/outlook";
import { getOutlookAuthorizationUrl, completeOutlookOAuthFlow } from "@/lib/email/providers/outlook-oauth-flow";
import { ValidationError } from "@/lib/errors";
import type { OutboundEmail } from "@/lib/email/types";

/**
 * Fournisseur Outlook réel (v0.9 bis, AR-0054) — Microsoft Graph
 * (`POST /me/sendMail`) + OAuth2 (`src/lib/microsoft/oauth.ts`). Mêmes
 * conventions que `tests/email/gmail.test.ts` : échec explicite sans
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

runIfDatabase("OutlookEmailProvider — échec explicite sans configuration", () => {
  const organizationIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  it("échoue explicitement (jamais un succès simulé) sans clientId/clientSecret/refreshToken", async () => {
    const organization = await prisma.organization.create({ data: { name: "Org outlook non configuré" } });
    organizationIds.push(organization.id);

    const result = await new OutlookEmailProvider().send(baseEmail(organization.id));
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/non configuré/);
  });
});

runIfDatabase("OutlookEmailProvider — envoi réel contre un vrai serveur HTTP local simulant Microsoft", () => {
  const organizationIds: string[] = [];
  let server: http.Server;
  let baseUrl: string;
  let requestLog: { url: string; method: string; headers: http.IncomingHttpHeaders; body: string }[] = [];
  let nextTokenStatus = 200;
  let nextSendStatus = 202;

  async function createOrgWithOutlookConfig(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org outlook ${suffix}` } });
    organizationIds.push(organization.id);
    await prisma.integration.create({
      data: {
        organizationId: organization.id,
        kind: "EMAIL",
        name: "Outlook",
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
        if (req.url === "/me/sendMail") {
          res.writeHead(nextSendStatus, { "Content-Type": "application/json", "request-id": "graph-req-1" });
          res.end(nextSendStatus === 202 ? "" : JSON.stringify({ error: { message: "insufficient permissions" } }));
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
    nextSendStatus = 202;
  });

  it("envoie réellement un email (refresh du jeton puis POST me/sendMail)", async () => {
    const organization = await createOrgWithOutlookConfig("send-ok");
    const result = await new OutlookEmailProvider().send(baseEmail(organization.id));

    expect(result.status).toBe("sent");
    expect(requestLog).toHaveLength(2);
    expect(requestLog[0].url).toBe("/token");
    expect(requestLog[0].body).toContain("grant_type=refresh_token");
    expect(requestLog[0].body).toContain("Mail.Send");
    expect(requestLog[1].url).toBe("/me/sendMail");
    expect(requestLog[1].headers.authorization).toBe("Bearer at-1");

    const sentBody = JSON.parse(requestLog[1].body);
    expect(sentBody.message.toRecipients).toEqual([{ emailAddress: { address: "client@example.test" } }]);
    expect(sentBody.message.subject).toBe("Bonjour");
    expect(sentBody.message.body.content).toBe("<p>Contenu</p>");
  });

  it("une erreur HTTP lors de l'envoi est reportée comme un échec explicite (jamais un succès)", async () => {
    nextSendStatus = 403;
    const organization = await createOrgWithOutlookConfig("send-error");
    const result = await new OutlookEmailProvider().send(baseEmail(organization.id));
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/403/);
  });

  it("un échec du renouvellement du jeton (refresh_token invalide) est reporté comme un échec explicite", async () => {
    nextTokenStatus = 400;
    const organization = await createOrgWithOutlookConfig("refresh-error");
    const result = await new OutlookEmailProvider().send(baseEmail(organization.id));
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/400/);
  });
});

runIfDatabase("Outlook — flux OAuth (config par organisation)", () => {
  const organizationIds: string[] = [];
  const originalRedirectUri = process.env.MICROSOFT_OAUTH_REDIRECT_URI;

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    if (originalRedirectUri) process.env.MICROSOFT_OAUTH_REDIRECT_URI = originalRedirectUri;
    else delete process.env.MICROSOFT_OAUTH_REDIRECT_URI;
  });

  it("getOutlookAuthorizationUrl rejette si aucun clientId n'est configuré", async () => {
    const organization = await prisma.organization.create({ data: { name: "Org outlook no client id" } });
    organizationIds.push(organization.id);
    await expect(getOutlookAuthorizationUrl(organization.id)).rejects.toThrow(ValidationError);
  });

  it("getOutlookAuthorizationUrl construit une URL de consentement avec le scope Mail.Send", async () => {
    const organization = await prisma.organization.create({ data: { name: "Org outlook client id" } });
    organizationIds.push(organization.id);
    await prisma.integration.create({
      data: { organizationId: organization.id, kind: "EMAIL", name: "Outlook", status: "DISCONNECTED", config: { clientId: "client-1" } as never },
    });
    process.env.MICROSOFT_OAUTH_REDIRECT_URI = "https://app.test/callback/outlook";

    const url = await getOutlookAuthorizationUrl(organization.id);
    const parsed = new URL(url);
    expect(parsed.searchParams.get("client_id")).toBe("client-1");
    expect(parsed.searchParams.get("scope")).toContain("Mail.Send");
    expect(parsed.searchParams.get("state")).toBe(organization.id);
    expect(parsed.hostname).toBe("login.microsoftonline.com");
  });

  it("completeOutlookOAuthFlow rejette explicitement si Microsoft ne renvoie aucun refresh_token", async () => {
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

    const organization = await prisma.organization.create({ data: { name: "Org outlook no refresh token" } });
    organizationIds.push(organization.id);
    await prisma.integration.create({
      data: {
        organizationId: organization.id,
        kind: "EMAIL",
        name: "Outlook",
        status: "DISCONNECTED",
        config: { clientId: "c", clientSecret: "s", oauthBaseUrl } as never,
      },
    });
    process.env.MICROSOFT_OAUTH_REDIRECT_URI = "https://app.test/callback/outlook";

    await expect(completeOutlookOAuthFlow(organization.id, "code")).rejects.toThrow(/refresh_token/);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("completeOutlookOAuthFlow persiste le refresh_token dans Integration.config (kind EMAIL)", async () => {
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

    const organization = await prisma.organization.create({ data: { name: "Org outlook flow complet" } });
    organizationIds.push(organization.id);
    await prisma.integration.create({
      data: {
        organizationId: organization.id,
        kind: "EMAIL",
        name: "Outlook",
        status: "DISCONNECTED",
        config: { clientId: "c", clientSecret: "s", oauthBaseUrl } as never,
      },
    });
    process.env.MICROSOFT_OAUTH_REDIRECT_URI = "https://app.test/callback/outlook";

    await completeOutlookOAuthFlow(organization.id, "auth-code");

    const integration = await prisma.integration.findFirstOrThrow({ where: { organizationId: organization.id, kind: "EMAIL" } });
    expect(integration.status).toBe("CONNECTED");
    expect((integration.config as { refreshToken?: string }).refreshToken).toBe("rt-stored");

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
