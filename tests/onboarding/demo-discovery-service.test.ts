import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { ensureAutomationTemplates } from "@/lib/automation/templates/seed-templates";
import { ensureWorkflowTemplates } from "@/lib/workflows/templates/seed-templates";
import { launchDemoDiscovery } from "@/lib/onboarding/demo-discovery-service";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";

/**
 * Bouton "Découvrir Autorun" (v1.6-8) : provisionne automatisations,
 * workflow, agent personnalisé et connecteurs simulés — vérifie surtout
 * l'idempotence (rejouable sans dupliquer) et l'isolation multi-tenant.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("demo-discovery-service (v1.6-8)", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  it("provisionne automatisations, workflow, agent et connecteurs simulés", async () => {
    await ensureAutomationTemplates();
    await ensureWorkflowTemplates();
    const fixture = await createWorkflowTestFixture("demo-discovery-provision");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const result = await launchDemoDiscovery(fixture.actor);

    expect(result.automations.length).toBeGreaterThan(0);
    expect(result.workflow?.ran).toBe(true);
    expect(result.agent.name).toBe("Assistant Découverte Autorun");
    expect(result.connectorsSimulated).toHaveLength(3);

    const agent = await prisma.customAgent.findUniqueOrThrow({ where: { id: result.agent.id } });
    expect(agent.workspaceId).toBe(fixture.workspace.id);

    const conversations = await prisma.customAgentConversation.findMany({ where: { customAgentId: result.agent.id } });
    expect(conversations).toHaveLength(1);
    const messages = await prisma.customAgentChatMessage.findMany({ where: { conversationId: conversations[0].id } });
    expect(messages.length).toBeGreaterThanOrEqual(2);

    const integrations = await prisma.integration.findMany({
      where: { organizationId: fixture.organization.id, kind: { in: ["CALENDAR", "SLACK", "DISCORD"] } },
    });
    expect(integrations).toHaveLength(3);
    expect(integrations.every((i) => i.status === "DEMO")).toBe(true);
  });

  it("est idempotent : un second appel ne duplique rien", async () => {
    await ensureAutomationTemplates();
    await ensureWorkflowTemplates();
    const fixture = await createWorkflowTestFixture("demo-discovery-idempotent");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    await launchDemoDiscovery(fixture.actor);
    const firstAutomationCount = await prisma.automation.count({ where: { workspaceId: fixture.workspace.id } });
    const firstWorkflowCount = await prisma.workflowDefinition.count({ where: { workspaceId: fixture.workspace.id } });
    const firstAgentCount = await prisma.customAgent.count({ where: { workspaceId: fixture.workspace.id } });
    const firstIntegrationCount = await prisma.integration.count({ where: { organizationId: fixture.organization.id } });

    await launchDemoDiscovery(fixture.actor);
    const secondAutomationCount = await prisma.automation.count({ where: { workspaceId: fixture.workspace.id } });
    const secondWorkflowCount = await prisma.workflowDefinition.count({ where: { workspaceId: fixture.workspace.id } });
    const secondAgentCount = await prisma.customAgent.count({ where: { workspaceId: fixture.workspace.id } });
    const secondIntegrationCount = await prisma.integration.count({ where: { organizationId: fixture.organization.id } });

    expect(secondAutomationCount).toBe(firstAutomationCount);
    expect(secondWorkflowCount).toBe(firstWorkflowCount);
    expect(secondAgentCount).toBe(firstAgentCount);
    expect(secondIntegrationCount).toBe(firstIntegrationCount);
  });

  it("isole le provisionnement par organisation", async () => {
    await ensureAutomationTemplates();
    await ensureWorkflowTemplates();
    const fixtureA = await createWorkflowTestFixture("demo-discovery-isolation-a");
    const fixtureB = await createWorkflowTestFixture("demo-discovery-isolation-b");
    organizationIds.push(fixtureA.organization.id, fixtureB.organization.id);
    userIds.push(fixtureA.user.id, fixtureB.user.id);

    await launchDemoDiscovery(fixtureA.actor);

    const agentsB = await prisma.customAgent.count({ where: { workspaceId: fixtureB.workspace.id } });
    const automationsB = await prisma.automation.count({ where: { workspaceId: fixtureB.workspace.id } });
    expect(agentsB).toBe(0);
    expect(automationsB).toBe(0);
  });
});
