import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import {
  createAutomationDefinition,
  createNewAutomationVersion,
  activateAutomationVersion,
  deactivateAutomation,
  archiveAutomation,
  cloneAutomationDefinition,
  exportAutomationDefinition,
  importAutomationDefinition,
  resolveAutomationForActor,
  listAutomationJobsForWorkspace,
  resolveAutomationJobForActor,
  getAutomationJobDetail,
} from "@/lib/automation/registry/automation-service";
import type { AutomationGraph } from "@/lib/automation/graph-types";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

function simpleGraph(): AutomationGraph {
  return {
    nodes: [
      { id: "t1", type: "trigger", position: { x: 0, y: 0 }, data: { triggerKey: "manual.user_action" } },
      { id: "a1", type: "action", position: { x: 0, y: 100 }, data: { jobType: "notification.create", input: { title: "Hello" } } },
      { id: "end1", type: "end", position: { x: 0, y: 200 }, data: {} },
    ],
    edges: [
      { id: "e1", source: "t1", target: "a1" },
      { id: "e2", source: "a1", target: "end1" },
    ],
  };
}

runIfDatabase("Automation Registry service", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  it("crée une automatisation, une nouvelle version, l'active, indexe les déclencheurs", async () => {
    const fixture = await createWorkflowTestFixture("automation-crud");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const { automation, version } = await createAutomationDefinition(fixture.actor, {
      key: "notify-on-manual",
      name: "Notifier manuellement",
      category: "test",
      graph: simpleGraph(),
    });
    expect(automation.status).toBe("DRAFT");
    expect(version.version).toBe(1);

    const v2 = await createNewAutomationVersion(fixture.actor, automation.id, { graph: simpleGraph(), changelog: "v2" });
    expect(v2.version).toBe(2);

    const activated = await activateAutomationVersion(fixture.actor, automation.id, v2.id);
    expect(activated.status).toBe("ACTIVE");
    expect(activated.activeVersionId).toBe(v2.id);

    const bindings = await prisma.automationTriggerBinding.findMany({ where: { automationId: automation.id } });
    expect(bindings.length).toBe(1);
    expect(bindings[0].triggerKey).toBe("manual.user_action");
    expect(bindings[0].isActive).toBe(true);
  });

  it("rejette un graphe invalide (aucun déclencheur)", async () => {
    const fixture = await createWorkflowTestFixture("automation-invalid-graph");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const invalidGraph: AutomationGraph = { nodes: [{ id: "end1", type: "end", position: { x: 0, y: 0 }, data: {} }], edges: [] };
    await expect(
      createAutomationDefinition(fixture.actor, { key: "invalid", name: "Invalide", category: "test", graph: invalidGraph })
    ).rejects.toThrow(ValidationError);
  });

  it("désactiver/archiver désactive les liaisons de déclencheur", async () => {
    const fixture = await createWorkflowTestFixture("automation-lifecycle");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const { automation, version } = await createAutomationDefinition(fixture.actor, {
      key: "lifecycle-test",
      name: "Lifecycle",
      category: "test",
      graph: simpleGraph(),
    });
    await activateAutomationVersion(fixture.actor, automation.id, version.id);

    await deactivateAutomation(fixture.actor, automation.id);
    const bindings = await prisma.automationTriggerBinding.findMany({ where: { automationId: automation.id } });
    expect(bindings.every((b) => !b.isActive)).toBe(true);

    await archiveAutomation(fixture.actor, automation.id);
    const archived = await prisma.automation.findUniqueOrThrow({ where: { id: automation.id } });
    expect(archived.status).toBe("ARCHIVED");
    expect(archived.archivedAt).not.toBeNull();
  });

  it("clone une automatisation existante, toujours en DRAFT", async () => {
    const fixture = await createWorkflowTestFixture("automation-clone");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const { automation, version } = await createAutomationDefinition(fixture.actor, {
      key: "source-automation",
      name: "Source",
      category: "test",
      graph: simpleGraph(),
    });
    await activateAutomationVersion(fixture.actor, automation.id, version.id);

    const cloned = await cloneAutomationDefinition(fixture.actor, automation.id, { newKey: "cloned-automation", newName: "Clone" });
    expect(cloned.automation.status).toBe("DRAFT");
    expect(cloned.automation.key).toBe("cloned-automation");
  });

  it("exporte puis réimporte une automatisation, en évitant la collision de clé", async () => {
    const fixture = await createWorkflowTestFixture("automation-export-import");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const { automation, version } = await createAutomationDefinition(fixture.actor, {
      key: "export-me",
      name: "À exporter",
      category: "test",
      graph: simpleGraph(),
    });
    await activateAutomationVersion(fixture.actor, automation.id, version.id);

    const exported = await exportAutomationDefinition(fixture.actor, automation.id);
    const imported = await importAutomationDefinition(fixture.actor, exported);
    expect(imported.automation.key).toBe("export-me-import-1"); // collision avec l'original, suffixe assigné
    expect(imported.automation.status).toBe("DRAFT");
  });

  it("isolation multi-tenant : une automatisation d'une autre organisation est introuvable", async () => {
    const fixtureA = await createWorkflowTestFixture("automation-tenant-a");
    organizationIds.push(fixtureA.organization.id);
    userIds.push(fixtureA.user.id);
    const fixtureB = await createWorkflowTestFixture("automation-tenant-b");
    organizationIds.push(fixtureB.organization.id);
    userIds.push(fixtureB.user.id);

    const { automation } = await createAutomationDefinition(fixtureA.actor, {
      key: "tenant-a-only",
      name: "A seulement",
      category: "test",
      graph: simpleGraph(),
    });

    await expect(resolveAutomationForActor(fixtureB.actor, automation.id)).rejects.toThrow(NotFoundError);
  });

  it("liste/détaille les jobs du noyau, strictement isolés par workspace", async () => {
    const fixtureA = await createWorkflowTestFixture("automation-jobs-tenant-a");
    organizationIds.push(fixtureA.organization.id);
    userIds.push(fixtureA.user.id);
    const fixtureB = await createWorkflowTestFixture("automation-jobs-tenant-b");
    organizationIds.push(fixtureB.organization.id);
    userIds.push(fixtureB.user.id);

    const job = await prisma.automationJob.create({
      data: {
        organizationId: fixtureA.organization.id,
        workspaceId: fixtureA.workspace.id,
        jobType: "notification.create",
        status: "SUCCEEDED",
      },
    });
    await prisma.automationJobLog.create({ data: { jobId: job.id, level: "info", message: "Test." } });

    const jobs = await listAutomationJobsForWorkspace(fixtureA.workspace.id, { status: "SUCCEEDED" });
    expect(jobs.some((j) => j.id === job.id)).toBe(true);

    const detail = await getAutomationJobDetail(fixtureA.actor, job.id);
    expect(detail.job.id).toBe(job.id);
    expect(detail.logs.length).toBe(1);

    await expect(resolveAutomationJobForActor(fixtureB.actor, job.id)).rejects.toThrow(NotFoundError);
  });
});
