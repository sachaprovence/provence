import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getGmailConfigState, testGmailConnection } from "@/lib/diagnostics/providers/gmail-diagnostic";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

async function createOrg(suffix: string) {
  return prisma.organization.create({ data: { name: `Org diag gmail ${suffix}` } });
}

runIfDatabase("getGmailConfigState (AR-0165)", () => {
  const organizationIds: string[] = [];
  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  it("NOT_CONFIGURED sans aucune ligne Integration EMAIL", async () => {
    const org = await createOrg("not-configured");
    organizationIds.push(org.id);
    expect(await getGmailConfigState(org.id)).toBe("NOT_CONFIGURED");
  });

  it("PARTIALLY_CONFIGURED avec seulement clientId/clientSecret (pas de refreshToken — OAuth non finalisé)", async () => {
    const org = await createOrg("partial");
    organizationIds.push(org.id);
    await prisma.integration.create({ data: { organizationId: org.id, kind: "EMAIL", name: "Email", status: "CONNECTED", config: { provider: "gmail", clientId: "id", clientSecret: "secret" } } });
    expect(await getGmailConfigState(org.id)).toBe("PARTIALLY_CONFIGURED");
  });

  it("CONFIGURED avec clientId/clientSecret/refreshToken", async () => {
    const org = await createOrg("configured");
    organizationIds.push(org.id);
    await prisma.integration.create({
      data: { organizationId: org.id, kind: "EMAIL", name: "Email", status: "CONNECTED", config: { provider: "gmail", clientId: "id", clientSecret: "secret", refreshToken: "refresh" } },
    });
    expect(await getGmailConfigState(org.id)).toBe("CONFIGURED");
  });
});

runIfDatabase("testGmailConnection — contre un vrai serveur OAuth local", () => {
  const organizationIds: string[] = [];
  let server: http.Server;
  let baseUrl: string;
  let nextStatus = 200;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      res.writeHead(nextStatus, { "Content-Type": "application/json" });
      res.end(JSON.stringify(nextStatus === 200 ? { access_token: "fake-token", expires_in: 3600, token_type: "Bearer" } : { error: "invalid_grant" }));
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
  });

  async function createConfiguredOrg(suffix: string, refreshToken = "refresh_should_never_leak") {
    const org = await createOrg(suffix);
    organizationIds.push(org.id);
    await prisma.integration.create({
      data: { organizationId: org.id, kind: "EMAIL", name: "Email", status: "CONNECTED", config: { provider: "gmail", clientId: "id", clientSecret: "secret", refreshToken, oauthBaseUrl: baseUrl } },
    });
    return org;
  }

  it("TEST_SUCCESS si le renouvellement de jeton Google réussit", async () => {
    const org = await createConfiguredOrg("success");
    const result = await testGmailConnection(org.id);
    expect(result.status).toBe("TEST_SUCCESS");
  });

  it("TEST_FAILED si Google refuse le jeton (401), sans jamais inclure le refreshToken dans le message", async () => {
    nextStatus = 401;
    const org = await createConfiguredOrg("failed", "refresh_should_never_leak_401");
    const result = await testGmailConnection(org.id);
    expect(result.status).toBe("TEST_FAILED");
    expect(result.message).not.toContain("refresh_should_never_leak_401");
  });

  it("UNAVAILABLE si Google est injoignable", async () => {
    const org = await createOrg("unavailable");
    organizationIds.push(org.id);
    await prisma.integration.create({
      data: { organizationId: org.id, kind: "EMAIL", name: "Email", status: "CONNECTED", config: { provider: "gmail", clientId: "id", clientSecret: "secret", refreshToken: "r", oauthBaseUrl: "http://127.0.0.1:1" } },
    });
    const result = await testGmailConnection(org.id);
    expect(result.status).toBe("UNAVAILABLE");
  });
});
