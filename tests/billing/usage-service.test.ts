import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { computeOrganizationUsage } from "@/lib/billing/usage-service";
import { assertAutomationRunAllowed, assertStorageAvailable, assertConnectorLimitAvailable } from "@/lib/billing/quota-enforcement";
import { applyPlanToOrganization } from "@/lib/billing/plan-service";
import { QuotaExceededError } from "@/lib/errors";
import { PlanKey, AutomationRunTrigger } from "@/generated/prisma/enums";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";

/**
 * Usage/quotas v1.4 (AR-0183) — vérifie que chaque limite de plan
 * (exécutions d'automatisation, stockage, connecteurs) est réellement
 * bloquante une fois atteinte, jamais avant, et qu'une organisation sans
 * plan (ou avec des limites `null`, illimitées) n'est jamais bloquée.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("usage-service / quota-enforcement (v1.4, AR-0183)", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  it("computeOrganizationUsage renvoie 'ok' pour une organisation sans plan (illimité)", async () => {
    const fixture = await createWorkflowTestFixture("usage-no-plan");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const usage = await computeOrganizationUsage(fixture.organization.id);
    expect(usage.automationRuns.status).toBe("ok");
    expect(usage.automationRuns.limit).toBeNull();
    expect(usage.storageMb.status).toBe("ok");
    expect(usage.connectors.status).toBe("ok");
    expect(usage.members.used).toBe(1);
  });

  it("assertAutomationRunAllowed bloque une fois la limite du plan atteinte, jamais avant", async () => {
    const fixture = await createWorkflowTestFixture("usage-automation-runs");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    await applyPlanToOrganization(fixture.organization.id, PlanKey.TRIAL);
    const trial = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.TRIAL } });

    const definition = await prisma.automation.create({
      data: {
        organizationId: fixture.organization.id,
        workspaceId: fixture.workspace.id,
        key: "usage-test-automation",
        name: "Test",
        category: "test",
        status: "ACTIVE",
      },
    });
    const version = await prisma.automationVersion.create({
      data: { automationId: definition.id, version: 1, graph: { nodes: [], edges: [] } as never },
    });

    for (let i = 0; i < trial.maxAutomationRuns!; i++) {
      await expect(assertAutomationRunAllowed(fixture.organization.id)).resolves.toBeUndefined();
      await prisma.automationRun.create({
        data: {
          organizationId: fixture.organization.id,
          workspaceId: fixture.workspace.id,
          automationId: definition.id,
          automationVersionId: version.id,
          trigger: AutomationRunTrigger.MANUAL,
        },
      });
    }

    await expect(assertAutomationRunAllowed(fixture.organization.id)).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it("assertStorageAvailable bloque un envoi qui dépasserait la limite de stockage du plan", async () => {
    const fixture = await createWorkflowTestFixture("usage-storage");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    await applyPlanToOrganization(fixture.organization.id, PlanKey.TRIAL);
    const trial = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.TRIAL } });

    await expect(assertStorageAvailable(fixture.organization.id, trial.maxStorageMb! * 1024 * 1024 - 1)).resolves.toBeUndefined();
    await expect(assertStorageAvailable(fixture.organization.id, trial.maxStorageMb! * 1024 * 1024 + 1)).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it("assertConnectorLimitAvailable autorise de reconfigurer un connecteur déjà en place, même à la limite", async () => {
    const fixture = await createWorkflowTestFixture("usage-connectors");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    await applyPlanToOrganization(fixture.organization.id, PlanKey.TRIAL);
    const trial = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.TRIAL } });

    for (let i = 0; i < trial.maxConnectors!; i++) {
      await prisma.integration.create({ data: { organizationId: fixture.organization.id, kind: "EMAIL", name: `conn-${i}`, status: "CONNECTED" } });
    }

    // Reconfigurer le MÊME kind déjà présent ne compte jamais comme un nouveau connecteur.
    await expect(assertConnectorLimitAvailable(fixture.organization.id, "EMAIL")).resolves.toBeUndefined();
    // Un kind différent, lui, dépasserait la limite.
    await expect(assertConnectorLimitAvailable(fixture.organization.id, "CALENDAR")).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it("isolation multi-tenant : l'usage d'une organisation n'est jamais affecté par une autre", async () => {
    const fixtureA = await createWorkflowTestFixture("usage-tenant-a");
    const fixtureB = await createWorkflowTestFixture("usage-tenant-b");
    organizationIds.push(fixtureA.organization.id, fixtureB.organization.id);
    userIds.push(fixtureA.user.id, fixtureB.user.id);
    await applyPlanToOrganization(fixtureA.organization.id, PlanKey.TRIAL);

    const trial = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.TRIAL } });
    for (let i = 0; i < trial.maxConnectors! + 5; i++) {
      await prisma.integration.create({ data: { organizationId: fixtureB.organization.id, kind: "EMAIL", name: `tenant-b-${i}`, status: "CONNECTED" } });
    }

    // B a dépassé sa propre limite (sans plan, donc illimité) — A, qui a un plan TRIAL mais
    // aucun connecteur, doit rester non bloqué.
    await expect(assertConnectorLimitAvailable(fixtureA.organization.id, "EMAIL")).resolves.toBeUndefined();
  });
});
