import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createApiKey, listApiKeys } from "@/lib/settings/api-keys-service";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";
import { expectNoCrossTenantLeak } from "../helpers/tenant-isolation";

/**
 * Isolation multi-tenant — Clés API publiques (v1.0, AR-0059/AR-0055). Une
 * clé API d'une organisation ne doit jamais apparaître dans la liste
 * d'une autre, et ne doit jamais permettre l'accès aux données d'une
 * autre organisation (voir tests/public-api/public-api.test.ts pour
 * l'isolation côté données).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("isolation multi-tenant — ApiKey", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  it("listApiKeys ne renvoie jamais la clé d'une autre organisation", async () => {
    const fixtureA = await createWorkflowTestFixture("api-key-isolation-a");
    organizationIds.push(fixtureA.organization.id);
    userIds.push(fixtureA.user.id);
    const fixtureB = await createWorkflowTestFixture("api-key-isolation-b");
    organizationIds.push(fixtureB.organization.id);
    userIds.push(fixtureB.user.id);

    const { preview: keyA } = await createApiKey({ organizationId: fixtureA.organization.id, name: "Clé A", createdById: fixtureA.user.id });
    const { preview: keyB } = await createApiKey({ organizationId: fixtureB.organization.id, name: "Clé B", createdById: fixtureB.user.id });

    await expectNoCrossTenantLeak({
      actorAItems: () => listApiKeys(fixtureA.organization.id),
      actorBItems: () => listApiKeys(fixtureB.organization.id),
      actorAOwnResourceId: keyA.id,
      actorBOwnResourceId: keyB.id,
      getId: (key) => key.id,
    });
  });

  it("les lignes ApiKey en base sont strictement scopées par organizationId", async () => {
    const fixtureA = await createWorkflowTestFixture("api-key-isolation-rows-a");
    organizationIds.push(fixtureA.organization.id);
    userIds.push(fixtureA.user.id);
    const fixtureB = await createWorkflowTestFixture("api-key-isolation-rows-b");
    organizationIds.push(fixtureB.organization.id);
    userIds.push(fixtureB.user.id);

    await createApiKey({ organizationId: fixtureA.organization.id, name: "Clé A", createdById: fixtureA.user.id });

    const rowsForB = await prisma.apiKey.findMany({ where: { organizationId: fixtureB.organization.id } });
    expect(rowsForB).toHaveLength(0);
  });
});
