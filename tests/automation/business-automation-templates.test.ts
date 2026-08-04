import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { ensureAutomationTemplates, AUTOMATION_TEMPLATE_KEYS } from "@/lib/automation/templates/seed-templates";
import { validateAutomationGraph } from "@/lib/automation/graph-validation";
import { cloneAutomationDefinition, activateAutomationVersion } from "@/lib/automation/registry/automation-service";
import { fireAutomationsForEvent } from "@/lib/automation/trigger-engine";
import { processQueuedAutomationRuns, processAutomationJobs } from "@/lib/automation/executor";
import { registerBuiltInAgentComponents } from "@/lib/agents/bootstrap";
import { ensureBusinessAgentPromptSeeds } from "@/lib/agents/business-agents-prompt-seeds";
import { installAgent, transitionInstallation } from "@/lib/agents/installation-service";
import { PROSPECTION_AGENT_RUNTIME_KEY } from "@/lib/agents/definitions/prospection-agent";
import { markVirtualTourDelivered } from "@/lib/production/virtual-tour-service";
import { AgentDefinitionStatus, MessageStatus } from "@/generated/prisma/enums";
import type { AutomationGraph } from "@/lib/automation/graph-types";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";

/**
 * Automatisations métier prêtes à l'emploi (brief v0.9, task #91 ; 11ᵉ
 * modèle "Livraison effectuée" ajouté en v1.1, AR-0175) — vérifie que les
 * automatisations nommément demandées sont seedées de façon idempotente,
 * que chaque graphe est structurellement valide, et qu'AU MOINS une
 * automatisation représentative par évènement significatif s'exécute
 * réellement de bout en bout (déclencheur réel → job réel → vrai résultat),
 * preuve que ces templates ne sont pas des exemples aspirationnels (voir
 * ADR 0037, étendu par ce même task).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT", "WAITING"]);

async function driveToTerminal(runId: string, maxTicks = 40) {
  for (let i = 0; i < maxTicks; i += 1) {
    const run = await prisma.automationRun.findUniqueOrThrow({ where: { id: runId } });
    if (TERMINAL.has(run.status)) return run;
    await processQueuedAutomationRuns();
    await processAutomationJobs({ limit: 20 });
  }
  return prisma.automationRun.findUniqueOrThrow({ where: { id: runId } });
}

runIfDatabase("Automatisations métier prêtes à l'emploi (v0.9)", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];
  const definitionIds: string[] = [];

  beforeAll(async () => {
    registerBuiltInAgentComponents();
    await ensureBusinessAgentPromptSeeds();
  });

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
    if (definitionIds.length > 0) await prisma.agentDefinition.deleteMany({ where: { id: { in: definitionIds } } });
  });

  it("seed les 11 automatisations prêtes à l'emploi demandées par le brief (dont Livraison effectuée, v1.1 AR-0175), de façon idempotente", async () => {
    expect(AUTOMATION_TEMPLATE_KEYS.length).toBe(11);

    await ensureAutomationTemplates();
    const firstCount = await prisma.automation.count({
      where: { isTemplate: true, workspaceId: null, key: { in: [...AUTOMATION_TEMPLATE_KEYS] } },
    });
    expect(firstCount).toBe(11);

    await ensureAutomationTemplates();
    const secondCount = await prisma.automation.count({
      where: { isTemplate: true, workspaceId: null, key: { in: [...AUTOMATION_TEMPLATE_KEYS] } },
    });
    expect(secondCount).toBe(11);
  });

  it("chaque graphe de template est structurellement valide (déclencheur, fin, aucune arête orpheline)", async () => {
    await ensureAutomationTemplates();
    const templates = await prisma.automation.findMany({
      where: { isTemplate: true, workspaceId: null, key: { in: [...AUTOMATION_TEMPLATE_KEYS] } },
      include: { activeVersion: true },
    });
    expect(templates.length).toBe(11);
    for (const template of templates) {
      expect(template.activeVersionId).not.toBeNull();
      const issues = validateAutomationGraph(template.activeVersion!.graph as unknown as AutomationGraph);
      expect(issues).toEqual([]);
    }
  });

  it("Nouveau prospect : un vrai lead créé déclenche réellement l'Agent Prospection, qui rédige un vrai message (jamais envoyé automatiquement)", async () => {
    await ensureAutomationTemplates();
    const fixture = await createWorkflowTestFixture("automation-template-nouveau-prospect");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const toolKeys = ["prospection.find_priority_leads", "prospection.score_lead", "prospection.draft_outreach"];
    const definition = await prisma.agentDefinition.create({
      data: {
        organizationId: null,
        key: `test-prospection-agent-automation-${fixture.organization.id}`,
        name: "Prospection (test automatisation)",
        author: "test",
        category: "prospection",
        status: AgentDefinitionStatus.PUBLISHED,
        runtimeKey: PROSPECTION_AGENT_RUNTIME_KEY,
        declaredToolKeys: toolKeys,
        declaredPermissions: ["MANAGE_LEADS", "VIEW_WORKSPACE"],
      },
    });
    definitionIds.push(definition.id);

    const installation = await installAgent(fixture.actor, {
      definitionId: definition.id,
      toolKeys,
      permissions: ["MANAGE_LEADS", "VIEW_WORKSPACE"],
    });
    await transitionInstallation(fixture.actor, installation.id, "activate");

    const source = await prisma.automation.findFirstOrThrow({ where: { key: "template-nouveau-prospect", isTemplate: true, workspaceId: null } });
    const cloned = await cloneAutomationDefinition(fixture.actor, source.id, { newKey: "nouveau-prospect-clone", newName: "Nouveau prospect (clone)" });
    await activateAutomationVersion(fixture.actor, cloned.automation.id, cloned.version.id);

    const lead = await prisma.lead.create({ data: { organizationId: fixture.organization.id, establishmentName: "Prospect automatisation" } });

    const fireResult = await fireAutomationsForEvent("lead.created", { organizationId: fixture.organization.id, leadId: lead.id });
    expect(fireResult.triggered).toBe(1);

    const run = await prisma.automationRun.findFirstOrThrow({ where: { automationId: cloned.automation.id } });
    const finished = await driveToTerminal(run.id);
    expect(finished.status).toBe("SUCCEEDED");

    const messages = await prisma.message.findMany({ where: { leadId: lead.id } });
    expect(messages).toHaveLength(1);
    expect(messages[0].status).toBe(MessageStatus.PENDING_VALIDATION);
  });

  it("Livraison effectuée (v1.1, AR-0175) : une vraie visite 3D livrée déclenche réellement une notification, jamais republiée deux fois", async () => {
    await ensureAutomationTemplates();
    const fixture = await createWorkflowTestFixture("automation-template-livraison-effectuee");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const source = await prisma.automation.findFirstOrThrow({ where: { key: "template-livraison-effectuee", isTemplate: true, workspaceId: null } });
    const cloned = await cloneAutomationDefinition(fixture.actor, source.id, { newKey: "livraison-effectuee-clone", newName: "Livraison effectuée (clone)" });
    await activateAutomationVersion(fixture.actor, cloned.automation.id, cloned.version.id);

    const lead = await prisma.lead.create({ data: { organizationId: fixture.organization.id, establishmentName: "Client livré" } });
    const customer = await prisma.customer.create({ data: { organizationId: fixture.organization.id, leadId: lead.id } });
    const mission = await prisma.mission.create({ data: { organizationId: fixture.organization.id, customerId: customer.id, title: "M1" } });
    const tour = await prisma.virtualTour.create({ data: { organizationId: fixture.organization.id, leadId: lead.id, missionId: mission.id } });

    await markVirtualTourDelivered(fixture.organization.id, tour.id);

    const run = await prisma.automationRun.findFirstOrThrow({ where: { automationId: cloned.automation.id } });
    const finished = await driveToTerminal(run.id);
    expect(finished.status).toBe("SUCCEEDED");

    const notifications = await prisma.notification.findMany({ where: { organizationId: fixture.organization.id, title: "Visite 3D livrée au client" } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].link).toBe(`/visits/${tour.id}`);

    // Idempotent côté source : un second appel à `markVirtualTourDelivered` ne republie jamais l'évènement.
    await markVirtualTourDelivered(fixture.organization.id, tour.id);
    const runsAfterSecondCall = await prisma.automationRun.count({ where: { automationId: cloned.automation.id } });
    expect(runsAfterSecondCall).toBe(1);
  });
});
