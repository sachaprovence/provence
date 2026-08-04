import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { resolveEmailConfig, updateEmailIntegrationConfig } from "@/lib/email/config";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";
import { expectNoCrossTenantLeak } from "../helpers/tenant-isolation";

/**
 * Isolation multi-tenant — Email (v0.10, AR-0055). Couvre les deux modèles
 * distincts du domaine email : `EmailAccount` (compte d'envoi/quota, sans
 * aucune couche service ni route dédiée) et `Integration` (kind EMAIL,
 * config OAuth Gmail/Outlook/SMTP, via `src/lib/email/config.ts`).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("isolation multi-tenant — EmailAccount", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  async function createOrgWithEmailAccount(suffix: string) {
    const fixture = await createWorkflowTestFixture(suffix);
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const emailAccount = await prisma.emailAccount.create({
      data: { organizationId: fixture.organization.id, fromName: `Expéditeur ${suffix}`, fromEmail: `${suffix}@example.test` },
    });
    return { ...fixture, emailAccount };
  }

  it("les comptes email d'une organisation ne sont jamais visibles pour une autre", async () => {
    const fixtureA = await createOrgWithEmailAccount("email-account-isolation-a");
    const fixtureB = await createOrgWithEmailAccount("email-account-isolation-b");

    await expectNoCrossTenantLeak({
      actorAItems: () => prisma.emailAccount.findMany({ where: { organizationId: fixtureA.organization.id } }),
      actorBItems: () => prisma.emailAccount.findMany({ where: { organizationId: fixtureB.organization.id } }),
      actorAOwnResourceId: fixtureA.emailAccount.id,
      actorBOwnResourceId: fixtureB.emailAccount.id,
      getId: (account) => account.id,
    });
  });
});

runIfDatabase("isolation multi-tenant — configuration OAuth email (Integration kind=EMAIL)", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  it("la configuration email d'une organisation n'est jamais lisible pour une autre", async () => {
    const fixtureA = await createWorkflowTestFixture("email-config-isolation-a");
    organizationIds.push(fixtureA.organization.id);
    userIds.push(fixtureA.user.id);
    const fixtureB = await createWorkflowTestFixture("email-config-isolation-b");
    organizationIds.push(fixtureB.organization.id);
    userIds.push(fixtureB.user.id);

    await updateEmailIntegrationConfig(fixtureA.organization.id, { smtpHost: "smtp-a.example.test", apiKey: "key-a" });
    await updateEmailIntegrationConfig(fixtureB.organization.id, { smtpHost: "smtp-b.example.test", apiKey: "key-b" });

    const configA = await resolveEmailConfig(fixtureA.organization.id);
    const configB = await resolveEmailConfig(fixtureB.organization.id);

    expect(configA.smtpHost).toBe("smtp-a.example.test");
    expect(configA.apiKey).toBe("key-a");
    expect(configB.smtpHost).toBe("smtp-b.example.test");
    expect(configB.apiKey).toBe("key-b");
  });
});
