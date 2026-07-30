import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerBuiltInAgentComponents } from "@/lib/agents/bootstrap";
import { installAgent, resolveInstallationOrThrow } from "@/lib/agents/installation-service";
import { createAgentRun } from "@/lib/agents/execution-engine";
import { setMemory } from "@/lib/agents/memory";
import { sendAgentMessage } from "@/lib/agents/messaging";
import { NotFoundError } from "@/lib/errors";
import { AgentMemoryScope, AgentMessageType } from "@/generated/prisma/enums";
import { createAgentTestFixture, cleanupAgentTestFixtures } from "../helpers/agent-fixtures";
import { expectNoCrossTenantLeak } from "../helpers/tenant-isolation";

/**
 * Isolation multi-tenant du Framework Agents (v0.3) : deux organisations
 * distinctes ne doivent jamais voir les installations, exécutions, mémoire
 * ou messages l'une de l'autre — même gabarit que
 * `tests/tenant-isolation/workspaces.test.ts` (v0.2).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("isolation multi-tenant — Agent Framework", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];
  const definitionIds: string[] = [];

  beforeAll(() => {
    registerBuiltInAgentComponents();
  });

  afterAll(async () => {
    await cleanupAgentTestFixtures(organizationIds, userIds, definitionIds);
  });

  it("les installations, exécutions, mémoires et messages d'une organisation sont invisibles à une autre", async () => {
    const fixtureA = await createAgentTestFixture("isolation-a");
    const fixtureB = await createAgentTestFixture("isolation-b");
    organizationIds.push(fixtureA.organization.id, fixtureB.organization.id);
    userIds.push(fixtureA.user.id, fixtureB.user.id);
    definitionIds.push(fixtureA.definition.id, fixtureB.definition.id);

    const installationA = await installAgent(fixtureA.actor, {
      definitionId: fixtureA.definition.id,
      toolKeys: [],
      permissions: [],
    });
    const installationB = await installAgent(fixtureB.actor, {
      definitionId: fixtureB.definition.id,
      toolKeys: [],
      permissions: [],
    });

    const runA = await createAgentRun({ installationId: installationA.id });
    const runB = await createAgentRun({ installationId: installationB.id });

    await expectNoCrossTenantLeak({
      actorAItems: () =>
        prisma.agentRun.findMany({ where: { installation: { organizationId: fixtureA.organization.id } } }),
      actorBItems: () =>
        prisma.agentRun.findMany({ where: { installation: { organizationId: fixtureB.organization.id } } }),
      actorAOwnResourceId: runA.id,
      actorBOwnResourceId: runB.id,
      getId: (run) => run.id,
    });

    await setMemory({
      workspaceId: fixtureA.workspace.id,
      installationId: installationA.id,
      scope: AgentMemoryScope.PERSISTENT,
      key: "secret",
      value: "org-a-only",
    });
    await setMemory({
      workspaceId: fixtureB.workspace.id,
      installationId: installationB.id,
      scope: AgentMemoryScope.PERSISTENT,
      key: "secret",
      value: "org-b-only",
    });

    const memoryVisibleToA = await prisma.agentMemoryEntry.findMany({
      where: { workspaceId: fixtureA.workspace.id },
    });
    expect(memoryVisibleToA.every((entry) => entry.installationId === installationA.id)).toBe(true);
    expect(memoryVisibleToA.map((entry) => entry.value)).not.toContain("org-b-only");

    const messageA = await sendAgentMessage({
      workspaceId: fixtureA.workspace.id,
      fromInstallationId: installationA.id,
      type: AgentMessageType.INFO,
      payload: { note: "org A" },
    });
    const messagesVisibleToB = await prisma.agentMessage.findMany({
      where: { workspaceId: fixtureB.workspace.id },
    });
    expect(messagesVisibleToB.map((m) => m.id)).not.toContain(messageA.id);
  });

  it("falsifier l'id d'une installation d'une autre organisation échoue (NotFoundError, pas de fuite d'existence)", async () => {
    const fixtureA = await createAgentTestFixture("isolation-spoof-a");
    const fixtureB = await createAgentTestFixture("isolation-spoof-b");
    organizationIds.push(fixtureA.organization.id, fixtureB.organization.id);
    userIds.push(fixtureA.user.id, fixtureB.user.id);
    definitionIds.push(fixtureA.definition.id, fixtureB.definition.id);

    const installationB = await installAgent(fixtureB.actor, {
      definitionId: fixtureB.definition.id,
      toolKeys: [],
      permissions: [],
    });

    // fixtureA (organisation A) tente d'accéder à une installation qui
    // appartient réellement à l'organisation B.
    await expect(resolveInstallationOrThrow(fixtureA.actor, installationB.id)).rejects.toBeInstanceOf(
      NotFoundError
    );
  });
});
