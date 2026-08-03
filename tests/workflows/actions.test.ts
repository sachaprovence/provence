import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerBuiltInWorkflowComponents } from "@/lib/workflows/bootstrap";
import { registerBuiltInAgentComponents } from "@/lib/agents/bootstrap";
import { installAgent, transitionInstallation } from "@/lib/agents/installation-service";
import { getWorkflowAction } from "@/lib/workflows/actions/registry";
import { createAgentTestFixture, cleanupAgentTestFixtures } from "../helpers/agent-fixtures";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

function testContext(overrides: Partial<{ organizationId: string; workspaceId: string }> = {}) {
  return {
    organizationId: overrides.organizationId ?? "org-test",
    workspaceId: overrides.workspaceId ?? "ws-test",
    runId: "run-test",
    nodeId: "node-test",
    setVariable: vi.fn(),
    log: vi.fn(async () => undefined),
  };
}

runIfDatabase("Workflow Engine — actions intégrées (plugins)", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];
  const definitionIds: string[] = [];

  beforeAll(() => {
    registerBuiltInAgentComponents();
    registerBuiltInWorkflowComponents();
  });

  afterAll(async () => {
    await cleanupAgentTestFixtures(organizationIds, userIds, definitionIds);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("notification.create écrit une Notification réelle", async () => {
    const fixture = await createAgentTestFixture("action-notification");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const action = getWorkflowAction("notification.create")!;
    const result = (await action.execute(
      { type: "workflow", title: "Titre de test" },
      testContext({ organizationId: fixture.organization.id, workspaceId: fixture.workspace.id })
    )) as { id: string };

    const row = await prisma.notification.findUniqueOrThrow({ where: { id: result.id } });
    expect(row.title).toBe("Titre de test");
    expect(row.organizationId).toBe(fixture.organization.id);
  });

  it("agent.call délègue à un agent réellement installé et attend son résultat", async () => {
    const fixture = await createAgentTestFixture("action-agent-call");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    definitionIds.push(fixture.definition.id);

    const installation = await installAgent(fixture.actor, {
      definitionId: fixture.definition.id,
      toolKeys: ["system.echo", "system.datetime", "system.workspace_info"],
      permissions: ["VIEW_WORKSPACE"],
    });
    await transitionInstallation(fixture.actor, installation.id, "activate");

    const action = getWorkflowAction("agent.call")!;
    const result = (await action.execute(
      { installationId: installation.id, input: {} },
      testContext({ organizationId: fixture.organization.id, workspaceId: fixture.workspace.id })
    )) as { status: string; output: unknown };

    expect(result.status).toBe("SUCCEEDED");
    expect(result.output).toBeTruthy();
  });

  it("agent.call échoue explicitement si aucun agent actif ne correspond", async () => {
    const fixture = await createAgentTestFixture("action-agent-call-missing");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const action = getWorkflowAction("agent.call")!;
    await expect(
      action.execute(
        { category: "categorie-inexistante" },
        testContext({ organizationId: fixture.organization.id, workspaceId: fixture.workspace.id })
      )
    ).rejects.toThrow(/Aucun agent actif/);
  });

  it("http.call_api effectue un appel sortant générique (fetch simulé)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } })
    );

    const action = getWorkflowAction("http.call_api")!;
    const result = (await action.execute(
      { url: "https://example.test/api", method: "POST", body: { a: 1 } },
      testContext()
    )) as { status: number; ok: boolean; body: unknown };

    expect(result.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.body).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("https://example.test/api", expect.objectContaining({ method: "POST" }));
  });

  it("email.send utilise le fournisseur email configuré (demo)", async () => {
    const action = getWorkflowAction("email.send")!;
    const result = (await action.execute(
      { fromName: "Autorun", fromEmail: "a@b.test", toEmail: "c@d.test", subject: "Sujet", body: "Corps" },
      testContext()
    )) as { status: string };

    expect(result.status).toBe("sent");
  });

  it("variable.set appelle context.setVariable avec le nom et la valeur", async () => {
    const action = getWorkflowAction("variable.set")!;
    const ctx = testContext();
    await action.execute({ name: "score", value: 42 }, ctx);
    expect(ctx.setVariable).toHaveBeenCalledWith("score", 42);
  });

  it("les actions non implémentées échouent explicitement (jamais un faux succès)", async () => {
    for (const key of ["sms.send", "file.write", "document.generate", "customer.update", "task.create", "quote.create", "invoice.create", "appointment.create"]) {
      const action = getWorkflowAction(key)!;
      expect(action, `action "${key}" doit être enregistrée`).toBeTruthy();
      await expect(action.execute({}, testContext())).rejects.toThrow(/n'est pas encore développée/);
    }
  });
});
