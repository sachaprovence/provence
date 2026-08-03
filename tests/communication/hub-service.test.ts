import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerBuiltInCommunicationProviders } from "@/lib/communication/bootstrap";
import { getCommunicationProvider, listRegisteredCommunicationProviderKeys } from "@/lib/communication/registry";
import { sendCommunication, resolveChannelProvider, updateChannelConfig } from "@/lib/communication/hub-service";
import { ValidationError } from "@/lib/errors";

/**
 * Communication Hub (v0.9, ADR 0038) : registre de canaux (SMS/WhatsApp/
 * Téléphone/Webhooks), résolution du fournisseur ACTIF par organisation
 * via `Integration.config` (jusqu'ici jamais lu par aucun code réel).
 * SMS/WhatsApp/Téléphone restent des stubs honnêtes (aucun identifiant
 * fournisseur disponible) ; les webhooks sortants sont une intégration
 * réelle (simple POST HTTP), vérifiée ici contre un vrai petit serveur
 * HTTP local (sans dépendance de mock supplémentaire).
 */
describe("registre + fournisseurs du Communication Hub", () => {
  it("enregistre les 4 fournisseurs intégrés de façon idempotente", () => {
    registerBuiltInCommunicationProviders();
    registerBuiltInCommunicationProviders();
    expect(getCommunicationProvider("SMS", "demo")).toBeDefined();
    expect(getCommunicationProvider("WHATSAPP", "demo")).toBeDefined();
    expect(getCommunicationProvider("PHONE", "demo")).toBeDefined();
    expect(getCommunicationProvider("WEBHOOK", "http")).toBeDefined();
  });

  it("liste les fournisseurs enregistrés par canal", () => {
    registerBuiltInCommunicationProviders();
    expect(listRegisteredCommunicationProviderKeys("SMS")).toContain("demo");
    expect(listRegisteredCommunicationProviderKeys("WEBHOOK")).toContain("http");
  });

  it("le fournisseur SMS démo simule un échec pour un numéro invalide", async () => {
    registerBuiltInCommunicationProviders();
    const provider = getCommunicationProvider("SMS", "demo")!;
    const failed = await provider.send({ organizationId: "org", to: "pas-un-numero", body: "test" });
    expect(failed.status).toBe("failed");

    const sent = await provider.send({ organizationId: "org", to: "+33612345678", body: "test" });
    expect(sent.status).toBe("sent");
    expect(sent.externalId).toBeDefined();
  });
});

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Communication Hub — résolution par organisation (Integration.config)", () => {
  const organizationIds: string[] = [];
  let server: http.Server;
  let serverUrl: string;
  let receivedRequests: { body: string; headers: http.IncomingHttpHeaders }[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  afterEach(() => {
    receivedRequests = [];
  });

  async function createOrg(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org communication ${suffix}` } });
    organizationIds.push(organization.id);
    return organization;
  }

  it("sans Integration configurée, retombe sur le fournisseur démo par défaut pour SMS", async () => {
    const organization = await createOrg("default-sms");
    const provider = await resolveChannelProvider(organization.id, "SMS");
    expect(provider.key).toBe("demo");
  });

  it("rejette un provider inconnu configuré pour un canal", async () => {
    const organization = await createOrg("unknown-provider");
    await prisma.integration.create({
      data: { organizationId: organization.id, kind: "SMS", name: "SMS", status: "CONNECTED", config: { provider: "twilio-not-implemented" } },
    });

    await expect(resolveChannelProvider(organization.id, "SMS")).rejects.toThrow(ValidationError);
  });

  it("updateChannelConfig crée/écrit l'Integration et sendCommunication l'utilise ensuite", async () => {
    const organization = await createOrg("update-config");
    const integration = await updateChannelConfig(organization.id, "SMS", { provider: "demo", config: { accountSid: "test" } });
    expect(integration.status).toBe("CONNECTED");

    const result = await sendCommunication(organization.id, "SMS", { to: "+33612345678", body: "Bonjour" });
    expect(result.status).toBe("sent");

    const auditLogs = await prisma.auditLog.findMany({ where: { organizationId: organization.id, action: "communication.sms.sent" } });
    expect(auditLogs).toHaveLength(1);
  });

  it("WEBHOOK est une intégration réelle : sendCommunication effectue un vrai POST HTTP", async () => {
    server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        receivedRequests.push({ body, headers: req.headers });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    serverUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;

    const organization = await createOrg("webhook-real");
    const result = await sendCommunication(organization.id, "WEBHOOK", {
      to: serverUrl,
      body: "Nouveau prospect créé",
      metadata: { secret: "s3cr3t" },
    });

    expect(result.status).toBe("sent");
    expect(receivedRequests).toHaveLength(1);
    expect(JSON.parse(receivedRequests[0].body).body).toBe("Nouveau prospect créé");
    expect(receivedRequests[0].headers["x-autorun-signature"]).toBeDefined();
  });

  it("un webhook vers une URL qui répond en erreur est marqué failed", async () => {
    const errorServer = http.createServer((_req, res) => {
      res.writeHead(500);
      res.end("boom");
    });
    await new Promise<void>((resolve) => errorServer.listen(0, resolve));
    const url = `http://127.0.0.1:${(errorServer.address() as AddressInfo).port}/`;

    const organization = await createOrg("webhook-error");
    const result = await sendCommunication(organization.id, "WEBHOOK", { to: url, body: "test" });
    expect(result.status).toBe("failed");

    await new Promise<void>((resolve) => errorServer.close(() => resolve()));
  });
});
