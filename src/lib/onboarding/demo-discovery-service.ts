import "server-only";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { cloneAutomationDefinition, activateAutomationVersion } from "@/lib/automation/registry/automation-service";
import { cloneWorkflowDefinition, activateVersion as activateWorkflowVersion, triggerManualRun as triggerWorkflowRun } from "@/lib/workflows/workflow-service";
import { createCustomAgent, createConversation, sendMessage } from "@/lib/agents/custom/custom-agent-service";
import type { WorkspaceActor } from "@/lib/workspace-context";

/**
 * Bouton "Découvrir Autorun" (v1.6, mission "MODE DÉMO") : provisionne en un
 * clic un environnement complet et immédiatement utilisable — sans passer
 * par l'assistant d'onboarding pas-à-pas. Réutilise systématiquement les
 * mécanismes existants (clonage de templates Automation/Workflow Engine,
 * v0.9/v1.4 ; agents personnalisés, v1.6-1 à -4 ; connecteurs, v1.6-5) :
 * aucune donnée de démonstration n'est fabriquée par un chemin parallèle.
 *
 * Idempotent par construction (clés déterministes par organisation, même
 * principe que `onboarding-service.ts#chooseOnboardingTemplate`) : ré-appuyer
 * sur le bouton ne duplique rien, réutilise ce qui existe déjà.
 */

const DEMO_AUTOMATION_TEMPLATE_KEYS = ["template-nouveau-prospect", "template-demande-devis"] as const;
const DEMO_WORKFLOW_TEMPLATE_KEY = "template-prospection";

async function ensureAutomationCloned(actor: WorkspaceActor, templateKey: string) {
  const source = await prisma.automation.findFirst({ where: { key: templateKey, isTemplate: true, workspaceId: null } });
  if (!source) return null;

  const cloneKey = `${templateKey}-decouverte-${actor.organization.id}`;
  const existing = await prisma.automation.findFirst({ where: { workspaceId: actor.workspace.id, key: cloneKey } });
  if (existing) return existing;

  const cloned = await cloneAutomationDefinition(actor, source.id, {
    newKey: cloneKey,
    newName: `${source.name} (démo Découvrir Autorun)`,
  });
  await activateAutomationVersion(actor, cloned.automation.id, cloned.version.id);
  return prisma.automation.findUniqueOrThrow({ where: { id: cloned.automation.id } });
}

async function ensureWorkflowClonedAndRun(actor: WorkspaceActor) {
  const source = await prisma.workflowDefinition.findFirst({
    where: { key: DEMO_WORKFLOW_TEMPLATE_KEY, isTemplate: true, workspaceId: null },
  });
  if (!source) return { definition: null, ran: false };

  const cloneKey = `${DEMO_WORKFLOW_TEMPLATE_KEY}-decouverte-${actor.organization.id}`;
  let definition = await prisma.workflowDefinition.findFirst({ where: { workspaceId: actor.workspace.id, key: cloneKey } });
  let ran = false;

  if (!definition) {
    const cloned = await cloneWorkflowDefinition(actor, source.id, { newKey: cloneKey, newName: `${source.name} (démo Découvrir Autorun)` });
    await activateWorkflowVersion(actor, cloned.definition.id, cloned.version.id);
    definition = await prisma.workflowDefinition.findUniqueOrThrow({ where: { id: cloned.definition.id } });
  }

  const hasRun = await prisma.workflowRun.findFirst({ where: { workflowDefinitionId: definition.id } });
  if (!hasRun) {
    await triggerWorkflowRun(actor, definition.id);
    ran = true;
  }

  return { definition, ran };
}

async function ensureDemoAgent(actor: WorkspaceActor) {
  const AGENT_NAME = "Assistant Découverte Autorun";
  let agent = await prisma.customAgent.findFirst({ where: { workspaceId: actor.workspace.id, name: AGENT_NAME } });
  let conversationCreated = false;

  if (!agent) {
    agent = await createCustomAgent(actor, {
      name: AGENT_NAME,
      description: "Créé automatiquement par « Découvrir Autorun » — un exemple d'agent personnalisé prêt à l'emploi.",
      systemPrompt: "Tu es un assistant qui aide à découvrir Autorun. Réponds en français, de façon concise et chaleureuse.",
      providerKey: "demo",
      toolKeys: ["system.datetime", "system.workspace_info"],
      memoryEnabled: true,
    });
  }

  const conversation =
    (await prisma.customAgentConversation.findFirst({ where: { customAgentId: agent.id } })) ??
    (await (async () => {
      conversationCreated = true;
      return createConversation(actor, agent!.id, "Bienvenue");
    })());

  if (conversationCreated) {
    await sendMessage(actor, conversation.id, "Bonjour ! Peux-tu m'expliquer ce que tu peux faire ?");
  }

  return agent;
}

async function ensureSimulatedConnector(actor: WorkspaceActor, kind: "CALENDAR" | "SLACK" | "DISCORD", name: string) {
  const existing = await prisma.integration.findFirst({ where: { organizationId: actor.organization.id, kind } });
  if (existing) return existing;

  return prisma.integration.create({
    data: {
      organizationId: actor.organization.id,
      kind,
      name,
      status: "DEMO",
      config: { simulated: true } as never,
    },
  });
}

export type DemoDiscoveryResult = {
  automations: { id: string; name: string }[];
  workflow: { id: string; name: string; ran: boolean } | null;
  agent: { id: string; name: string };
  connectorsSimulated: string[];
};

export async function launchDemoDiscovery(actor: WorkspaceActor): Promise<DemoDiscoveryResult> {
  const automations = (
    await Promise.all(DEMO_AUTOMATION_TEMPLATE_KEYS.map((key) => ensureAutomationCloned(actor, key)))
  ).filter((a): a is NonNullable<typeof a> => a !== null);

  const { definition: workflowDefinition, ran: workflowRan } = await ensureWorkflowClonedAndRun(actor);
  const agent = await ensureDemoAgent(actor);

  const connectors = await Promise.all([
    ensureSimulatedConnector(actor, "CALENDAR", "Google Calendar (démo)"),
    ensureSimulatedConnector(actor, "SLACK", "Slack (démo)"),
    ensureSimulatedConnector(actor, "DISCORD", "Discord (démo)"),
  ]);

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "demo_discovery.launched",
    entityType: "Organization",
    entityId: actor.organization.id,
    metadata: { automationCount: automations.length, workflowRan },
  });

  return {
    automations: automations.map((a) => ({ id: a.id, name: a.name })),
    workflow: workflowDefinition ? { id: workflowDefinition.id, name: workflowDefinition.name, ran: workflowRan } : null,
    agent: { id: agent.id, name: agent.name },
    connectorsSimulated: connectors.map((c) => c.name),
  };
}
