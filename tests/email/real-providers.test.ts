import http from "node:http";
import type { AddressInfo } from "node:net";
import { SMTPServer } from "smtp-server";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { SmtpEmailProvider } from "@/lib/email/providers/smtp";
import { ResendEmailProvider } from "@/lib/email/providers/resend";
import { PostmarkEmailProvider } from "@/lib/email/providers/postmark";
import { BrevoEmailProvider } from "@/lib/email/providers/brevo";
import { configValue, type EmailIntegrationConfig } from "@/lib/email/config";
import type { OutboundEmail } from "@/lib/email/types";

/**
 * Fournisseurs email réels (brief v0.9 : "Supprimer progressivement le
 * fonctionnement démo") — vérifie : (1) l'échec explicite quand la
 * configuration est absente (jamais un succès simulé), (2) la résolution
 * de configuration PAR ORGANISATION via `Integration.config` (repli sur
 * les variables d'environnement), (3) un envoi RÉEL réussi contre de vrais
 * petits serveurs locaux (SMTP et HTTP) — la vérification end-to-end
 * contre de vrais comptes Resend/Postmark/Brevo/SMTP n'a pas été possible
 * dans cet environnement (aucun identifiant disponible), voir ADR 0038.
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

describe("configValue — repli config par organisation puis variable d'environnement", () => {
  it("préfère la config à l'environnement, et retombe sur l'environnement si absente", () => {
    const config: EmailIntegrationConfig = { apiKey: "from-config" };
    expect(configValue(config, "apiKey", "SOME_ENV_VAR_NOT_SET")).toBe("from-config");

    process.env.TEST_EMAIL_FALLBACK_VAR = "from-env";
    expect(configValue({}, "apiKey", "TEST_EMAIL_FALLBACK_VAR")).toBe("from-env");
    delete process.env.TEST_EMAIL_FALLBACK_VAR;

    expect(configValue({}, "apiKey", "SOME_ENV_VAR_NOT_SET")).toBeUndefined();
  });
});

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Fournisseurs email réels — échec explicite sans configuration", () => {
  const organizationIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  async function createOrg(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org email ${suffix}` } });
    organizationIds.push(organization.id);
    return organization;
  }

  it("SMTP échoue explicitement (jamais un succès simulé) sans hôte/identifiants", async () => {
    const organization = await createOrg("smtp-unconfigured");
    const result = await new SmtpEmailProvider().send(baseEmail(organization.id));
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/non configuré/);
  });

  it("Resend échoue explicitement sans clé API", async () => {
    const organization = await createOrg("resend-unconfigured");
    const result = await new ResendEmailProvider().send(baseEmail(organization.id));
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/non configuré/);
  });

  it("Postmark échoue explicitement sans jeton", async () => {
    const organization = await createOrg("postmark-unconfigured");
    const result = await new PostmarkEmailProvider().send(baseEmail(organization.id));
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/non configuré/);
  });

  it("Brevo échoue explicitement sans clé API", async () => {
    const organization = await createOrg("brevo-unconfigured");
    const result = await new BrevoEmailProvider().send(baseEmail(organization.id));
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/non configuré/);
  });
});

runIfDatabase("Fournisseur SMTP — envoi réel contre un vrai serveur SMTP local", () => {
  const organizationIds: string[] = [];
  let server: SMTPServer;
  let port: number;
  const receivedMails: { from: string; to: string[] }[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  it("envoie réellement un email via SMTP quand l'organisation configure son propre serveur", async () => {
    server = new SMTPServer({
      authOptional: true,
      disabledCommands: ["STARTTLS"],
      onAuth(_auth, _session, callback) {
        callback(null, { user: "test" });
      },
      onData(stream, session, callback) {
        stream.on("end", () => {
          receivedMails.push({ from: session.envelope.mailFrom ? session.envelope.mailFrom.address : "", to: session.envelope.rcptTo.map((r) => r.address) });
          callback();
        });
        stream.resume();
      },
    });
    await new Promise<void>((resolve, reject) => {
      server.listen(0, "127.0.0.1", () => resolve());
      server.on("error", reject);
    });
    port = (server.server.address() as AddressInfo).port;

    const organization = await prisma.organization.create({ data: { name: "Org SMTP réel" } });
    organizationIds.push(organization.id);
    await prisma.integration.create({
      data: {
        organizationId: organization.id,
        kind: "EMAIL",
        name: "SMTP",
        status: "CONNECTED",
        config: { smtpHost: "127.0.0.1", smtpPort: port, smtpUser: "test", smtpPassword: "test", smtpSecure: false },
      },
    });

    const result = await new SmtpEmailProvider().send(baseEmail(organization.id));
    expect(result.status).toBe("sent");
    expect(result.providerMessageId).toBeTruthy();
    expect(receivedMails).toHaveLength(1);
    expect(receivedMails[0].to).toContain("client@example.test");
  });
});

runIfDatabase("Fournisseurs HTTP (Resend/Postmark/Brevo) — envoi réel contre un serveur HTTP local", () => {
  const organizationIds: string[] = [];
  let server: http.Server;
  let requestsReceived: { url: string; method: string; headers: http.IncomingHttpHeaders; body: string }[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  async function startServer(responseBody: unknown, statusCode = 200) {
    requestsReceived = [];
    server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        requestsReceived.push({ url: req.url ?? "", method: req.method ?? "", headers: req.headers, body });
        res.writeHead(statusCode, { "Content-Type": "application/json" });
        res.end(JSON.stringify(responseBody));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  }

  async function createOrgWithEmailConfig(suffix: string, config: Record<string, unknown>) {
    const organization = await prisma.organization.create({ data: { name: `Org http email ${suffix}` } });
    organizationIds.push(organization.id);
    await prisma.integration.create({
      data: { organizationId: organization.id, kind: "EMAIL", name: suffix, status: "CONNECTED", config: config as never },
    });
    return organization;
  }

  it("Resend : envoie réellement (POST + Authorization Bearer), organisation isolée par sa propre clé", async () => {
    const baseUrl = await startServer({ id: "resend-msg-1" });
    const organization = await createOrgWithEmailConfig("resend", { apiKey: "re_test_key", baseUrl });

    const result = await new ResendEmailProvider().send(baseEmail(organization.id));
    expect(result.status).toBe("sent");
    expect(result.providerMessageId).toBe("resend-msg-1");
    expect(requestsReceived).toHaveLength(1);
    expect(requestsReceived[0].method).toBe("POST");
    expect(requestsReceived[0].headers.authorization).toBe("Bearer re_test_key");
    expect(JSON.parse(requestsReceived[0].body).to).toEqual(["client@example.test"]);
  });

  it("Postmark : envoie réellement (X-Postmark-Server-Token)", async () => {
    const baseUrl = await startServer({ MessageID: "postmark-msg-1" });
    const organization = await createOrgWithEmailConfig("postmark", { apiKey: "pm_test_token", baseUrl });

    const result = await new PostmarkEmailProvider().send(baseEmail(organization.id));
    expect(result.status).toBe("sent");
    expect(result.providerMessageId).toBe("postmark-msg-1");
    expect(requestsReceived[0].headers["x-postmark-server-token"]).toBe("pm_test_token");
  });

  it("Brevo : envoie réellement (api-key header)", async () => {
    const baseUrl = await startServer({ messageId: "brevo-msg-1" });
    const organization = await createOrgWithEmailConfig("brevo", { apiKey: "brevo_test_key", baseUrl });

    const result = await new BrevoEmailProvider().send(baseEmail(organization.id));
    expect(result.status).toBe("sent");
    expect(result.providerMessageId).toBe("brevo-msg-1");
    expect(requestsReceived[0].headers["api-key"]).toBe("brevo_test_key");
  });

  it("une réponse HTTP en erreur est reportée comme un échec explicite (jamais un succès)", async () => {
    const baseUrl = await startServer({ message: "invalid API key" }, 401);
    const organization = await createOrgWithEmailConfig("resend-error", { apiKey: "bad-key", baseUrl });

    const result = await new ResendEmailProvider().send(baseEmail(organization.id));
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/401/);
  });
});
