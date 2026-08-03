import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerBuiltInAgentComponents } from "@/lib/agents/bootstrap";
import { registerAgentRuntime } from "@/lib/agents/registry";
import { createAgentRun, executeAgentRun, cancelAgentRun } from "@/lib/agents/execution-engine";
import { installAgent, transitionInstallation } from "@/lib/agents/installation-service";
import { ValidationError } from "@/lib/errors";
import { AgentDefinitionStatus } from "@/generated/prisma/enums";
import { createAgentTestFixture, cleanupAgentTestFixtures } from "../helpers/agent-fixtures";

const SLOW_RUNTIME_KEY = "test.slow-agent";
const FAILING_RUNTIME_KEY = "test.failing-agent";

/**
 * Test d'intégration (nécessite une vraie base PostgreSQL) : moteur
 * d'exécution — création, traitement de la file, application réelle des
 * permissions d'outil, timeout, reprises automatiques, annulation.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("moteur d'exécution des agents", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];
  const definitionIds: string[] = [];

  beforeAll(() => {
    registerBuiltInAgentComponents();
    registerAgentRuntime({
      runtimeKey: SLOW_RUNTIME_KEY,
      async execute() {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return { output: "ne devrait jamais être atteint si le timeout est plus court" };
      },
    });
    let failingAttempts = 0;
    registerAgentRuntime({
      runtimeKey: FAILING_RUNTIME_KEY,
      async execute() {
        failingAttempts += 1;
        throw new Error(`échec simulé (tentative ${failingAttempts})`);
      },
    });
  });

  afterAll(async () => {
    await cleanupAgentTestFixtures(organizationIds, userIds, definitionIds);
  });

  async function activeInstallationWithRuntime(
    suffix: string,
    runtimeKey: string,
    declaredToolKeys: string[] = []
  ) {
    const fixture = await createAgentTestFixture(suffix);
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    definitionIds.push(fixture.definition.id);

    const definition = await prisma.agentDefinition.update({
      where: { id: fixture.definition.id },
      data: { runtimeKey, declaredToolKeys },
    });

    const installation = await installAgent(fixture.actor, {
      definitionId: definition.id,
      toolKeys: declaredToolKeys,
      permissions: [],
    });
    await transitionInstallation(fixture.actor, installation.id, "activate");

    return { ...fixture, installation };
  }

  it("exécute une file avec succès de bout en bout (outils, mémoire, journal)", async () => {
    const { installation } = await activeInstallationWithRuntime("exec-success", "system.diagnostic-agent", [
      "system.echo",
      "system.datetime",
      "system.workspace_info",
    ]);

    const run = await createAgentRun({
      installationId: installation.id,
      input: { requestIntervention: false },
    });
    await executeAgentRun(run.id);

    const finished = await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(finished.status).toBe("SUCCEEDED");
    expect(finished.output).not.toBeNull();

    const logs = await prisma.agentRunLog.findMany({ where: { runId: run.id } });
    expect(logs.length).toBeGreaterThan(0);
  });

  it("refuse l'appel d'un outil non accordé à l'installation, échoue le run, journalise le refus", async () => {
    // Le runtime de diagnostic appelle system.echo sans qu'il soit accordé ici.
    const { installation, organization } = await activeInstallationWithRuntime(
      "exec-denied",
      "system.diagnostic-agent",
      []
    );

    const run = await createAgentRun({ installationId: installation.id, maxAttempts: 1 });
    await executeAgentRun(run.id);

    const finished = await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(finished.status).toBe("FAILED");
    expect(JSON.stringify(finished.error)).toContain("system.echo");

    const deniedLog = await prisma.auditLog.findFirst({
      where: {
        organizationId: organization.id,
        action: "agent.tool_access_denied",
        entityId: installation.id,
      },
    });
    expect(deniedLog).not.toBeNull();
  });

  it("dépasse le délai imparti (timeout) et se termine en TIMED_OUT sans tentative supplémentaire", async () => {
    const { installation } = await activeInstallationWithRuntime("exec-timeout", SLOW_RUNTIME_KEY);

    const run = await createAgentRun({ installationId: installation.id, timeoutMs: 50, maxAttempts: 1 });
    await executeAgentRun(run.id);

    const finished = await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(finished.status).toBe("TIMED_OUT");
  });

  it("retente automatiquement après un échec, puis échoue définitivement une fois maxAttempts atteint", async () => {
    const { installation } = await activeInstallationWithRuntime("exec-retry", FAILING_RUNTIME_KEY);

    const run = await createAgentRun({ installationId: installation.id, maxAttempts: 2 });

    await executeAgentRun(run.id);
    const afterFirst = await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(afterFirst.status).toBe("QUEUED"); // reprise automatique planifiée
    expect(afterFirst.attempt).toBe(1);

    await executeAgentRun(run.id);
    const afterSecond = await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(afterSecond.status).toBe("FAILED");
    expect(afterSecond.attempt).toBe(2);
  });

  it("annule une exécution en attente ; une exécution déjà terminée ne peut plus être annulée", async () => {
    const { installation } = await activeInstallationWithRuntime("exec-cancel", "system.diagnostic-agent", [
      "system.echo",
      "system.datetime",
      "system.workspace_info",
    ]);

    const run = await createAgentRun({ installationId: installation.id });
    const cancelled = await cancelAgentRun(run.id);
    expect(cancelled.status).toBe("CANCELLED");

    await expect(cancelAgentRun(run.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuse d'exécuter une installation qui n'est pas active", async () => {
    const fixture = await createAgentTestFixture("exec-inactive");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    definitionIds.push(fixture.definition.id);

    await prisma.agentDefinition.update({
      where: { id: fixture.definition.id },
      data: { status: AgentDefinitionStatus.PUBLISHED },
    });
    const installation = await installAgent(fixture.actor, {
      definitionId: fixture.definition.id,
      toolKeys: [],
      permissions: [],
    });
    // Reste au statut INSTALLED (jamais activé).

    const run = await createAgentRun({ installationId: installation.id });
    await executeAgentRun(run.id);

    const finished = await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(finished.status).toBe("FAILED");
    expect(JSON.stringify(finished.error)).toContain("active");
  });
});
