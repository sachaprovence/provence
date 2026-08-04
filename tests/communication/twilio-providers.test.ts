import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { TwilioSmsProvider } from "@/lib/communication/providers/twilio-sms-provider";
import { TwilioWhatsAppProvider } from "@/lib/communication/providers/twilio-whatsapp-provider";
import { TwilioPhoneProvider } from "@/lib/communication/providers/twilio-phone-provider";
import type { OutboundCommunication } from "@/lib/communication/types";

/**
 * Fournisseurs Twilio réels (v1.1, AR-0170) — API REST Twilio (pas de SDK,
 * `fetch()` + Basic Auth), même patron que `tests/email/gmail.test.ts` :
 * échec explicite sans configuration, requête vérifiée contre un vrai
 * serveur HTTP local (jamais un succès simulé).
 */
function baseMessage(organizationId: string, overrides: Partial<OutboundCommunication> = {}): OutboundCommunication {
  return { organizationId, to: "+33612345678", body: "Bonjour, ceci est un message de test.", ...overrides };
}

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Fournisseurs Twilio — échec explicite sans configuration", () => {
  const organizationIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  it("TwilioSmsProvider échoue explicitement sans accountSid/authToken/fromNumber", async () => {
    const organization = await prisma.organization.create({ data: { name: "Org twilio sms non configuré" } });
    organizationIds.push(organization.id);

    const result = await new TwilioSmsProvider().send(baseMessage(organization.id));
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/non configuré/);
  });

  it("TwilioWhatsAppProvider échoue explicitement sans configuration", async () => {
    const organization = await prisma.organization.create({ data: { name: "Org twilio whatsapp non configuré" } });
    organizationIds.push(organization.id);

    const result = await new TwilioWhatsAppProvider().send(baseMessage(organization.id));
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/non configuré/);
  });

  it("TwilioPhoneProvider échoue explicitement sans configuration", async () => {
    const organization = await prisma.organization.create({ data: { name: "Org twilio phone non configuré" } });
    organizationIds.push(organization.id);

    const result = await new TwilioPhoneProvider().send(baseMessage(organization.id));
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/non configuré/);
  });
});

runIfDatabase("Fournisseurs Twilio — envoi réel contre un vrai serveur HTTP local simulant l'API Twilio", () => {
  const organizationIds: string[] = [];
  let server: http.Server;
  let baseUrl: string;
  let requestLog: { url: string; method: string; headers: http.IncomingHttpHeaders; body: string }[] = [];
  let nextStatus = 200;

  async function createOrgWithTwilioConfig(kind: "SMS" | "WHATSAPP" | "PHONE", suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org twilio ${suffix}` } });
    organizationIds.push(organization.id);
    await prisma.integration.create({
      data: {
        organizationId: organization.id,
        kind,
        name: `Twilio ${kind}`,
        status: "CONNECTED",
        config: { provider: "twilio", accountSid: "AC-test", authToken: "auth-test", fromNumber: "+33600000000", apiBaseUrl: baseUrl } as never,
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
        res.writeHead(nextStatus, { "Content-Type": "application/json" });
        res.end(nextStatus === 200 ? JSON.stringify({ sid: "SM-test-123", status: "queued" }) : JSON.stringify({ message: "Invalid credentials" }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  afterEach(() => {
    requestLog = [];
    nextStatus = 200;
  });

  it("TwilioSmsProvider envoie une requête POST signée Basic Auth avec To/From/Body exacts", async () => {
    const organization = await createOrgWithTwilioConfig("SMS", "sms");

    const result = await new TwilioSmsProvider().send(baseMessage(organization.id, { to: "+33611112222", body: "Relance visite virtuelle" }));
    expect(result.status).toBe("sent");
    expect(result.externalId).toBe("SM-test-123");

    expect(requestLog).toHaveLength(1);
    const request = requestLog[0];
    expect(request.method).toBe("POST");
    expect(request.url).toBe("/Accounts/AC-test/Messages.json");
    expect(request.headers.authorization).toBe(`Basic ${Buffer.from("AC-test:auth-test").toString("base64")}`);
    expect(request.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    const params = new URLSearchParams(request.body);
    expect(params.get("To")).toBe("+33611112222");
    expect(params.get("From")).toBe("+33600000000");
    expect(params.get("Body")).toBe("Relance visite virtuelle");
  });

  it("TwilioWhatsAppProvider préfixe To/From avec 'whatsapp:'", async () => {
    const organization = await createOrgWithTwilioConfig("WHATSAPP", "whatsapp");

    await new TwilioWhatsAppProvider().send(baseMessage(organization.id, { to: "+33611112222" }));

    const params = new URLSearchParams(requestLog[0].body);
    expect(params.get("To")).toBe("whatsapp:+33611112222");
    expect(params.get("From")).toBe("whatsapp:+33600000000");
  });

  it("TwilioPhoneProvider appelle /Calls.json avec un document TwiML minimal contenant le message", async () => {
    const organization = await createOrgWithTwilioConfig("PHONE", "phone");

    const result = await new TwilioPhoneProvider().send(baseMessage(organization.id, { body: "Votre devis est prêt <important>" }));
    expect(result.status).toBe("sent");

    expect(requestLog[0].url).toBe("/Accounts/AC-test/Calls.json");
    const params = new URLSearchParams(requestLog[0].body);
    expect(params.get("Twiml")).toContain("<Say language=\"fr-FR\">Votre devis est prêt &lt;important&gt;</Say>");
  });

  it("lève une erreur explicite si Twilio renvoie une erreur", async () => {
    nextStatus = 401;
    const organization = await createOrgWithTwilioConfig("SMS", "sms-error");

    const result = await new TwilioSmsProvider().send(baseMessage(organization.id));
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/401/);
    expect(result.error).not.toMatch(/auth-test/); // jamais le secret en clair dans le message d'erreur.
  });
});
