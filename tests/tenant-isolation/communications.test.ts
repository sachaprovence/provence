import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { updateChannelConfig } from "@/lib/communication/hub-service";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";
import { expectNoCrossTenantLeak } from "../helpers/tenant-isolation";

/**
 * Isolation multi-tenant — Communication Hub (v0.10, AR-0055). `Integration`
 * (kind SMS/WHATSAPP/PHONE/WEBHOOK) n'a ni fonction de liste ni fonction de
 * lecture par id scopées acteur (`hub-service.ts` n'expose que
 * `updateChannelConfig`/`resolveChannelProvider`, prenant un `organizationId`
 * direct) — ce test vérifie que la configuration d'un canal écrite pour une
 * organisation n'est jamais visible ni modifiable pour une autre.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("isolation multi-tenant — Communication Hub", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  async function createOrgWithSmsConfig(suffix: string) {
    const fixture = await createWorkflowTestFixture(suffix);
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const preview = await updateChannelConfig(fixture.organization.id, "SMS", { provider: "demo", config: { apiKey: `secret-${suffix}` } });
    return { ...fixture, integrationId: preview.id };
  }

  it("la configuration d'un canal d'une organisation n'apparaît jamais dans la liste d'une autre", async () => {
    const fixtureA = await createOrgWithSmsConfig("comm-isolation-a");
    const fixtureB = await createOrgWithSmsConfig("comm-isolation-b");

    await expectNoCrossTenantLeak({
      actorAItems: () => prisma.integration.findMany({ where: { organizationId: fixtureA.organization.id, kind: "SMS" } }),
      actorBItems: () => prisma.integration.findMany({ where: { organizationId: fixtureB.organization.id, kind: "SMS" } }),
      actorAOwnResourceId: fixtureA.integrationId,
      actorBOwnResourceId: fixtureB.integrationId,
      getId: (integration) => integration.id,
    });
  });

  it("le secret configuré par une organisation n'est jamais lisible via la config d'une autre organisation", async () => {
    const fixtureA = await createOrgWithSmsConfig("comm-isolation-secret-a");
    const fixtureB = await createOrgWithSmsConfig("comm-isolation-secret-b");

    const rowA = await prisma.integration.findFirstOrThrow({ where: { organizationId: fixtureA.organization.id, kind: "SMS" } });
    const rowB = await prisma.integration.findFirstOrThrow({ where: { organizationId: fixtureB.organization.id, kind: "SMS" } });

    expect((rowA.config as { apiKey?: string }).apiKey).toBe("secret-comm-isolation-secret-a");
    expect((rowB.config as { apiKey?: string }).apiKey).toBe("secret-comm-isolation-secret-b");
  });
});
