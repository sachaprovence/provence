import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerBuiltInAutomationActions } from "@/lib/automation/actions";
import { getAutomationJobHandler, listAutomationJobHandlers } from "@/lib/automation/actions/registry";
import { KnowledgeSourceType, MemoryKind, MemoryScopeType } from "@/generated/prisma/enums";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

function testContext(overrides: Partial<{ organizationId: string; workspaceId: string }> = {}) {
  return {
    organizationId: overrides.organizationId ?? "org-test",
    workspaceId: overrides.workspaceId ?? "ws-test",
    jobId: "job-test",
    runId: "run-test",
    nodeId: "node-test",
    setVariable: vi.fn(),
    log: vi.fn(async () => undefined),
  };
}

runIfDatabase("Automation Engine — registre de jobs/actions (plugins)", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  it("enregistre les 12 gestionnaires réels et les 8 stubs honnêtes (20 au total)", () => {
    registerBuiltInAutomationActions();
    expect(listAutomationJobHandlers().length).toBe(20);
  });

  it("variable.set appelle context.setVariable avec le nom et la valeur", async () => {
    const action = getAutomationJobHandler("variable.set")!;
    const ctx = testContext();
    const result = (await action.execute({ name: "score", value: 42 }, ctx)) as { name: string; value: unknown };
    expect(ctx.setVariable).toHaveBeenCalledWith("score", 42);
    expect(result).toEqual({ name: "score", value: 42 });
  });

  it('variable.set rejette une entrée sans "name"', async () => {
    const action = getAutomationJobHandler("variable.set")!;
    await expect(action.execute({ value: 1 } as never, testContext())).rejects.toThrow(/nécessite "name"/);
  });

  it("notification.create écrit une Notification réelle, isolée par organisation", async () => {
    const fixture = await createWorkflowTestFixture("automation-action-notification");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const action = getAutomationJobHandler("notification.create")!;
    const result = (await action.execute(
      { type: "automation", title: "Titre de test" },
      testContext({ organizationId: fixture.organization.id, workspaceId: fixture.workspace.id })
    )) as { id: string };

    const row = await prisma.notification.findUniqueOrThrow({ where: { id: result.id } });
    expect(row.title).toBe("Titre de test");
    expect(row.organizationId).toBe(fixture.organization.id);
  });

  it("email.send utilise le fournisseur email configuré (demo)", async () => {
    const action = getAutomationJobHandler("email.send")!;
    const result = (await action.execute(
      { fromName: "Autorun", fromEmail: "a@b.test", toEmail: "c@d.test", subject: "Sujet", body: "Corps" },
      testContext()
    )) as { status: string };

    expect(result.status).toBe("sent");
  });

  it("http.request effectue un appel sortant générique (fetch simulé)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } })
    );

    const action = getAutomationJobHandler("http.request")!;
    const result = (await action.execute({ url: "https://example.test/api", method: "POST", body: { a: 1 } }, testContext())) as {
      status: number;
      ok: boolean;
      body: unknown;
    };

    expect(result.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.body).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("https://example.test/api", expect.objectContaining({ method: "POST" }));
    fetchMock.mockRestore();
  });

  it("lead.create / lead.update / lead.delete opèrent un CRUD réel et isolé par organisation", async () => {
    const fixture = await createWorkflowTestFixture("automation-action-lead");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    const ctx = testContext({ organizationId: fixture.organization.id, workspaceId: fixture.workspace.id });

    const created = (await getAutomationJobHandler("lead.create")!.execute(
      { establishmentName: "Établissement Test", city: "Paris" },
      ctx
    )) as { leadId: string };
    const createdRow = await prisma.lead.findUniqueOrThrow({ where: { id: created.leadId } });
    expect(createdRow.establishmentName).toBe("Établissement Test");
    expect(createdRow.organizationId).toBe(fixture.organization.id);

    await getAutomationJobHandler("lead.update")!.execute({ leadId: created.leadId, stage: "QUALIFIED" }, ctx);
    const updatedRow = await prisma.lead.findUniqueOrThrow({ where: { id: created.leadId } });
    expect(updatedRow.stage).toBe("QUALIFIED");

    await getAutomationJobHandler("lead.delete")!.execute({ leadId: created.leadId }, ctx);
    const deletedRow = await prisma.lead.findFirst({ where: { id: created.leadId } });
    expect(deletedRow).toBeNull();
  });

  it("lead.update échoue explicitement pour un lead d'une autre organisation (isolation multi-tenant)", async () => {
    const fixtureA = await createWorkflowTestFixture("automation-action-lead-tenant-a");
    organizationIds.push(fixtureA.organization.id);
    userIds.push(fixtureA.user.id);
    const fixtureB = await createWorkflowTestFixture("automation-action-lead-tenant-b");
    organizationIds.push(fixtureB.organization.id);
    userIds.push(fixtureB.user.id);

    const created = (await getAutomationJobHandler("lead.create")!.execute(
      { establishmentName: "Établissement A" },
      testContext({ organizationId: fixtureA.organization.id, workspaceId: fixtureA.workspace.id })
    )) as { leadId: string };

    await expect(
      getAutomationJobHandler("lead.update")!.execute(
        { leadId: created.leadId, stage: "QUALIFIED" },
        testContext({ organizationId: fixtureB.organization.id, workspaceId: fixtureB.workspace.id })
      )
    ).rejects.toThrow(/introuvable/);
  });

  it("knowledge.index indexe un document réel (Knowledge Engine, v0.7)", async () => {
    const fixture = await createWorkflowTestFixture("automation-action-knowledge");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const action = getAutomationJobHandler("knowledge.index")!;
    const result = (await action.execute(
      { sourceType: KnowledgeSourceType.NOTE, raw: "Contenu de test", title: "Note de test" },
      testContext({ organizationId: fixture.organization.id, workspaceId: fixture.workspace.id })
    )) as { documentId: string; status: string };

    const row = await prisma.knowledgeDocument.findUniqueOrThrow({ where: { id: result.documentId } });
    expect(row.title).toBe("Note de test");
    expect(row.organizationId).toBe(fixture.organization.id);
  });

  it("memory.set écrit une entrée versionnée réelle (Memory Engine, v0.7)", async () => {
    const fixture = await createWorkflowTestFixture("automation-action-memory");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const action = getAutomationJobHandler("memory.set")!;
    const result = (await action.execute(
      { scopeType: MemoryScopeType.WORKSPACE, scopeId: fixture.workspace.id, kind: MemoryKind.TEMPORARY, key: "compteur", value: 1 },
      testContext({ organizationId: fixture.organization.id, workspaceId: fixture.workspace.id })
    )) as { id: string; version: number };

    expect(result.version).toBe(1);
    const row = await prisma.memoryEntry.findUniqueOrThrow({ where: { id: result.id } });
    expect(row.key).toBe("compteur");
    expect(row.organizationId).toBe(fixture.organization.id);
  });

  it("les jobs non implémentés échouent explicitement (jamais un faux succès)", async () => {
    for (const key of [
      "sms.send",
      "file.write",
      "document.generate",
      "customer.update",
      "task.create",
      "quote.create",
      "invoice.create",
      "appointment.create",
    ]) {
      const action = getAutomationJobHandler(key)!;
      expect(action, `action "${key}" doit être enregistrée`).toBeTruthy();
      await expect(action.execute({}, testContext())).rejects.toThrow(/n'est pas encore développée/);
    }
  });
});
