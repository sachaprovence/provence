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

  it("enregistre les 14 gestionnaires réels et les 7 stubs honnêtes (21 au total)", () => {
    registerBuiltInAutomationActions();
    expect(listAutomationJobHandlers().length).toBe(21);
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

  it("notification.create respecte une préférence désactivée pour l'utilisateur ciblé, sans affecter les diffusions sans utilisateur (v1.1, AR-0180)", async () => {
    const fixture = await createWorkflowTestFixture("automation-action-notification-preference");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    await prisma.notificationPreference.create({
      data: { organizationId: fixture.organization.id, userId: fixture.user.id, eventKey: "quote.signed", channel: "APP", enabled: false },
    });

    const action = getAutomationJobHandler("notification.create")!;

    // Utilisateur ciblé avec préférence désactivée : aucune notification créée.
    const blocked = (await action.execute(
      { userId: fixture.user.id, type: "quote.signed", title: "Devis signé" },
      testContext({ organizationId: fixture.organization.id, workspaceId: fixture.workspace.id })
    )) as { id: string | null };
    expect(blocked.id).toBeNull();

    // Même utilisateur, évènement différent (non désactivé) : notification créée normalement.
    const allowed = (await action.execute(
      { userId: fixture.user.id, type: "invoice.paid", title: "Paiement reçu" },
      testContext({ organizationId: fixture.organization.id, workspaceId: fixture.workspace.id })
    )) as { id: string };
    expect(allowed.id).not.toBeNull();

    // Diffusion sans utilisateur ciblé : jamais bloquée, même pour "quote.signed".
    const broadcast = (await action.execute(
      { type: "quote.signed", title: "Diffusion large" },
      testContext({ organizationId: fixture.organization.id, workspaceId: fixture.workspace.id })
    )) as { id: string };
    expect(broadcast.id).not.toBeNull();

    const notifications = await prisma.notification.findMany({ where: { organizationId: fixture.organization.id } });
    expect(notifications).toHaveLength(2);
  });

  it("email.send utilise le fournisseur email configuré (demo)", async () => {
    const fixture = await createWorkflowTestFixture("automation-action-email-send");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const action = getAutomationJobHandler("email.send")!;
    const result = (await action.execute(
      { fromName: "Autorun", fromEmail: "a@b.test", toEmail: "c@d.test", subject: "Sujet", body: "Corps" },
      testContext({ organizationId: fixture.organization.id, workspaceId: fixture.workspace.id })
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
      "quote.create",
      "invoice.create",
      "appointment.create",
    ]) {
      const action = getAutomationJobHandler(key)!;
      expect(action, `action "${key}" doit être enregistrée`).toBeTruthy();
      await expect(action.execute({}, testContext())).rejects.toThrow(/n'est pas encore développée/);
    }
  });

  it("task.create écrit une Task réelle, rattachée au lead fourni (v1.4, AR-0181)", async () => {
    const fixture = await createWorkflowTestFixture("automation-action-task-create");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    const source = await prisma.leadSource.create({ data: { organizationId: fixture.organization.id, type: "MANUAL", label: "test" } });
    const lead = await prisma.lead.create({ data: { organizationId: fixture.organization.id, establishmentName: "Test", sourceId: source.id } });

    const action = getAutomationJobHandler("task.create")!;
    const result = (await action.execute(
      { title: "Relancer ce prospect", leadId: lead.id, dueInDays: 2 },
      testContext({ organizationId: fixture.organization.id, workspaceId: fixture.workspace.id })
    )) as { taskId: string };

    const row = await prisma.task.findUniqueOrThrow({ where: { id: result.taskId } });
    expect(row.title).toBe("Relancer ce prospect");
    expect(row.leadId).toBe(lead.id);
    expect(row.organizationId).toBe(fixture.organization.id);
    expect(row.dueAt).not.toBeNull();
  });

  it("task.create rejette un leadId d'une AUTRE organisation (isolation multi-tenant)", async () => {
    const fixtureA = await createWorkflowTestFixture("automation-action-task-tenant-a");
    const fixtureB = await createWorkflowTestFixture("automation-action-task-tenant-b");
    organizationIds.push(fixtureA.organization.id, fixtureB.organization.id);
    userIds.push(fixtureA.user.id, fixtureB.user.id);
    const source = await prisma.leadSource.create({ data: { organizationId: fixtureB.organization.id, type: "MANUAL", label: "test" } });
    const leadB = await prisma.lead.create({ data: { organizationId: fixtureB.organization.id, establishmentName: "Test B", sourceId: source.id } });

    const action = getAutomationJobHandler("task.create")!;
    await expect(
      action.execute(
        { title: "Ne doit jamais se créer", leadId: leadB.id },
        testContext({ organizationId: fixtureA.organization.id, workspaceId: fixtureA.workspace.id })
      )
    ).rejects.toThrow(/introuvable/);
  });

  it("report.daily_summary agrège l'activité des 24h et diffuse une notification (v1.4, AR-0181)", async () => {
    const fixture = await createWorkflowTestFixture("automation-action-daily-summary");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    const source = await prisma.leadSource.create({ data: { organizationId: fixture.organization.id, type: "MANUAL", label: "test" } });
    await prisma.lead.create({ data: { organizationId: fixture.organization.id, establishmentName: "Nouveau", sourceId: source.id } });

    const action = getAutomationJobHandler("report.daily_summary")!;
    const result = (await action.execute({}, testContext({ organizationId: fixture.organization.id, workspaceId: fixture.workspace.id }))) as {
      notificationId: string;
    };

    const row = await prisma.notification.findUniqueOrThrow({ where: { id: result.notificationId } });
    expect(row.organizationId).toBe(fixture.organization.id);
    expect(row.userId).toBeNull();
    expect(row.body).toMatch(/nouveau/);
  });
});
