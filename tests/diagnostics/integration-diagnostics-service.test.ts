import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { listIntegrationDiagnostics, runIntegrationDiagnosticTest } from "@/lib/diagnostics/integration-diagnostics-service";
import { clearRateLimitBuckets } from "@/lib/security/rate-limiter";
import { ValidationError, TooManyRequestsError } from "@/lib/errors";

/**
 * Orchestrateur du diagnostic des intégrations (v1.2, AR-0165) — vérifie la
 * fusion état-de-configuration / dernier-test-connu, le refus explicite de
 * tester une intégration incomplète, la limitation de débit, et surtout
 * qu'AUCUNE valeur secrète n'apparaît jamais dans la réponse (organisation,
 * clé, état, message textuel sûr — jamais la configuration elle-même).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const ORIGINAL_ENV = { ...process.env };

function restoreEnv(key: string, original: string | undefined) {
  if (original === undefined) delete process.env[key];
  else process.env[key] = original;
}

function clearDeploymentLevelEnv() {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STORAGE_S3_BUCKET;
  delete process.env.STORAGE_S3_REGION;
  delete process.env.STORAGE_S3_ACCESS_KEY_ID;
  delete process.env.STORAGE_S3_SECRET_ACCESS_KEY;
}

afterEach(() => {
  restoreEnv("STRIPE_SECRET_KEY", ORIGINAL_ENV.STRIPE_SECRET_KEY);
  restoreEnv("STRIPE_WEBHOOK_SECRET", ORIGINAL_ENV.STRIPE_WEBHOOK_SECRET);
  restoreEnv("STORAGE_S3_BUCKET", ORIGINAL_ENV.STORAGE_S3_BUCKET);
  restoreEnv("STORAGE_S3_REGION", ORIGINAL_ENV.STORAGE_S3_REGION);
  restoreEnv("STORAGE_S3_ACCESS_KEY_ID", ORIGINAL_ENV.STORAGE_S3_ACCESS_KEY_ID);
  restoreEnv("STORAGE_S3_SECRET_ACCESS_KEY", ORIGINAL_ENV.STORAGE_S3_SECRET_ACCESS_KEY);
  clearRateLimitBuckets();
});

runIfDatabase("listIntegrationDiagnostics (AR-0165)", () => {
  const organizationIds: string[] = [];
  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  it("renvoie les 5 intégrations à NOT_CONFIGURED pour une organisation neuve sans aucune configuration", async () => {
    clearDeploymentLevelEnv();
    const org = await prisma.organization.create({ data: { name: "Org diag vide" } });
    organizationIds.push(org.id);

    const diagnostics = await listIntegrationDiagnostics(org.id);
    expect(diagnostics).toHaveLength(5);
    expect(diagnostics.map((d) => d.key).sort()).toEqual(["GMAIL", "OUTLOOK", "S3_STORAGE", "STRIPE", "TWILIO"]);
    for (const d of diagnostics) {
      expect(d.status).toBe("NOT_CONFIGURED");
      expect(d.statusLabel).toBe("non configurée");
      expect(d.testable).toBe(false);
      expect(d.message).toBeNull();
      expect(d.lastCheckedAt).toBeNull();
    }
  });

  it("ne renvoie jamais de champ ressemblant à un secret dans le résumé JSON", async () => {
    clearDeploymentLevelEnv();
    const org = await prisma.organization.create({ data: { name: "Org diag secrets" } });
    organizationIds.push(org.id);
    await prisma.integration.create({
      data: { organizationId: org.id, kind: "SMS", name: "SMS", status: "CONNECTED", config: { provider: "twilio-sms", accountSid: "ACxxx", authToken: "should-never-appear" } },
    });

    const diagnostics = await listIntegrationDiagnostics(org.id);
    const serialized = JSON.stringify(diagnostics);
    expect(serialized).not.toContain("should-never-appear");
    for (const key of Object.keys(diagnostics[0])) {
      expect(key.toLowerCase()).not.toMatch(/secret|password|token/);
    }
  });
});

runIfDatabase("runIntegrationDiagnosticTest (AR-0165)", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.integrationDiagnosticCheck.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("refuse de tester une intégration dont la configuration est incomplète (ValidationError, aucun appel réseau)", async () => {
    clearDeploymentLevelEnv();
    const org = await prisma.organization.create({ data: { name: "Org diag incomplète" } });
    organizationIds.push(org.id);
    const user = await prisma.user.create({ data: { email: `diag-${org.id}@test.local`, passwordHash: "x", firstName: "Test", lastName: "User" } });
    userIds.push(user.id);

    await expect(runIntegrationDiagnosticTest(org.id, "STRIPE", user.id)).rejects.toThrow(ValidationError);
    const checks = await prisma.integrationDiagnosticCheck.findMany({ where: { organizationId: org.id } });
    expect(checks).toHaveLength(0);
  });

  it("limite le débit à 5 tests par intégration/organisation sur 5 minutes (TooManyRequestsError), même sans configuration", async () => {
    clearDeploymentLevelEnv();
    const org = await prisma.organization.create({ data: { name: "Org diag rate limit" } });
    organizationIds.push(org.id);
    const user = await prisma.user.create({ data: { email: `diag-rl-${org.id}@test.local`, passwordHash: "x", firstName: "Test", lastName: "User" } });
    userIds.push(user.id);

    for (let i = 0; i < 5; i += 1) {
      await expect(runIntegrationDiagnosticTest(org.id, "STRIPE", user.id)).rejects.toThrow(ValidationError);
    }
    await expect(runIntegrationDiagnosticTest(org.id, "STRIPE", user.id)).rejects.toThrow(TooManyRequestsError);
  });
});

runIfDatabase("runIntegrationDiagnosticTest — flux complet contre un vrai serveur HTTP local (AR-0165)", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];
  let server: http.Server;
  let baseUrl: string;
  let nextStatus = 200;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      res.writeHead(nextStatus, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ sid: "ACxxx", status: "active" }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.integrationDiagnosticCheck.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  afterEach(() => {
    nextStatus = 200;
  });

  it("persiste le résultat, journalise sans secret, et le reflète dans listIntegrationDiagnostics", async () => {
    const org = await prisma.organization.create({ data: { name: "Org diag flux complet" } });
    organizationIds.push(org.id);
    const user = await prisma.user.create({ data: { email: `diag-flux-${org.id}@test.local`, passwordHash: "x", firstName: "Alice", lastName: "Admin" } });
    userIds.push(user.id);
    await prisma.integration.create({
      data: { organizationId: org.id, kind: "SMS", name: "SMS", status: "CONNECTED", config: { provider: "twilio-sms", accountSid: "ACxxx", authToken: "secret-never-persisted-raw", apiBaseUrl: baseUrl } },
    });

    const summary = await runIntegrationDiagnosticTest(org.id, "TWILIO", user.id);
    expect(summary.status).toBe("TEST_SUCCESS");
    expect(summary.statusLabel).toBe("test réussi");
    expect(summary.lastCheckedBy).toEqual({ id: user.id, firstName: "Alice", lastName: "Admin" });
    expect(JSON.stringify(summary)).not.toContain("secret-never-persisted-raw");

    const persisted = await prisma.integrationDiagnosticCheck.findFirst({ where: { organizationId: org.id, integration: "TWILIO" } });
    expect(persisted?.status).toBe("TEST_SUCCESS");
    expect(persisted?.message).not.toContain("secret-never-persisted-raw");

    const diagnostics = await listIntegrationDiagnostics(org.id);
    const twilio = diagnostics.find((d) => d.key === "TWILIO")!;
    expect(twilio.status).toBe("TEST_SUCCESS");
  });

  it("retombe sur l'état de configuration réel (jamais un TEST_SUCCESS obsolète) si la configuration redevient incomplète après un test réussi", async () => {
    const org = await prisma.organization.create({ data: { name: "Org diag config retirée" } });
    organizationIds.push(org.id);
    const user = await prisma.user.create({ data: { email: `diag-retire-${org.id}@test.local`, passwordHash: "x", firstName: "Test", lastName: "User" } });
    userIds.push(user.id);
    const integration = await prisma.integration.create({
      data: { organizationId: org.id, kind: "SMS", name: "SMS", status: "CONNECTED", config: { provider: "twilio-sms", accountSid: "ACxxx", authToken: "t", apiBaseUrl: baseUrl } },
    });

    const beforeSummary = await runIntegrationDiagnosticTest(org.id, "TWILIO", user.id);
    expect(beforeSummary.status).toBe("TEST_SUCCESS");

    // L'organisation retire ensuite le authToken — la configuration redevient incomplète.
    await prisma.integration.update({ where: { id: integration.id }, data: { config: { provider: "twilio-sms", accountSid: "ACxxx" } } });

    const diagnostics = await listIntegrationDiagnostics(org.id);
    const twilio = diagnostics.find((d) => d.key === "TWILIO")!;
    expect(twilio.status).toBe("PARTIALLY_CONFIGURED");
    expect(twilio.testable).toBe(false);
  });
});
