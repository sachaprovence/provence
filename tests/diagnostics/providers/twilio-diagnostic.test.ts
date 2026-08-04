import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getTwilioConfigState, testTwilioConnection } from "@/lib/diagnostics/providers/twilio-diagnostic";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

async function createOrg(suffix: string) {
  return prisma.organization.create({ data: { name: `Org diag twilio ${suffix}` } });
}

runIfDatabase("getTwilioConfigState (AR-0165)", () => {
  const organizationIds: string[] = [];
  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  it("NOT_CONFIGURED sans aucune ligne Integration", async () => {
    const org = await createOrg("not-configured");
    organizationIds.push(org.id);
    expect(await getTwilioConfigState(org.id)).toBe("NOT_CONFIGURED");
  });

  it("PARTIALLY_CONFIGURED avec seulement accountSid", async () => {
    const org = await createOrg("partial");
    organizationIds.push(org.id);
    await prisma.integration.create({ data: { organizationId: org.id, kind: "SMS", name: "SMS", status: "CONNECTED", config: { provider: "twilio-sms", accountSid: "ACxxx" } } });
    expect(await getTwilioConfigState(org.id)).toBe("PARTIALLY_CONFIGURED");
  });

  it("CONFIGURED avec accountSid ET authToken", async () => {
    const org = await createOrg("configured");
    organizationIds.push(org.id);
    await prisma.integration.create({
      data: { organizationId: org.id, kind: "SMS", name: "SMS", status: "CONNECTED", config: { provider: "twilio-sms", accountSid: "ACxxx", authToken: "secret_token" } },
    });
    expect(await getTwilioConfigState(org.id)).toBe("CONFIGURED");
  });
});

runIfDatabase("testTwilioConnection — contre un vrai serveur HTTP local", () => {
  const organizationIds: string[] = [];
  let server: http.Server;
  let baseUrl: string;
  let nextStatus = 200;
  let requestLog: { url: string; headers: http.IncomingHttpHeaders }[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      requestLog.push({ url: req.url!, headers: req.headers });
      res.writeHead(nextStatus, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ sid: "ACxxx", status: nextStatus === 200 ? "active" : "error" }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  afterEach(() => {
    nextStatus = 200;
    requestLog = [];
  });

  async function createConfiguredOrg(suffix: string, authToken = "secret_token_value") {
    const org = await createOrg(suffix);
    organizationIds.push(org.id);
    await prisma.integration.create({
      data: {
        organizationId: org.id,
        kind: "SMS",
        name: "SMS",
        status: "CONNECTED",
        config: { provider: "twilio-sms", accountSid: "ACxxx", authToken, apiBaseUrl: baseUrl },
      },
    });
    return org;
  }

  it("TEST_SUCCESS si Twilio répond 200, avec Basic Auth attendu sur /Accounts/{Sid}.json", async () => {
    const org = await createConfiguredOrg("success");
    const result = await testTwilioConnection(org.id);
    expect(result.status).toBe("TEST_SUCCESS");
    expect(requestLog[0].url).toBe("/Accounts/ACxxx.json");
    expect(requestLog[0].headers.authorization).toMatch(/^Basic /);
  });

  it("TEST_FAILED si Twilio répond 401, sans jamais inclure authToken dans le message", async () => {
    nextStatus = 401;
    const org = await createConfiguredOrg("failed", "secret_token_should_never_leak");
    const result = await testTwilioConnection(org.id);
    expect(result.status).toBe("TEST_FAILED");
    expect(result.message).not.toContain("secret_token_should_never_leak");
  });

  it("UNAVAILABLE si l'API Twilio est injoignable", async () => {
    const org = await createOrg("unavailable");
    organizationIds.push(org.id);
    await prisma.integration.create({
      data: { organizationId: org.id, kind: "SMS", name: "SMS", status: "CONNECTED", config: { provider: "twilio-sms", accountSid: "ACxxx", authToken: "t", apiBaseUrl: "http://127.0.0.1:1" } },
    });
    const result = await testTwilioConnection(org.id);
    expect(result.status).toBe("UNAVAILABLE");
  });
});
