import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerBuiltInAgentComponents } from "@/lib/agents/bootstrap";
import { registerAgentRuntime } from "@/lib/agents/registry";
import { installAgent, transitionInstallation } from "@/lib/agents/installation-service";
import { createAgentRun, executeAgentRun } from "@/lib/agents/execution-engine";
import {
  recordConversationTurn,
  listConversation,
  recordDecision,
  listDecisions,
  recordUserPreference,
  getPreferences,
  setWorkingContext,
  getWorkingContext,
  listRunSummaries,
} from "@/lib/agents/director/memory-helpers";
import { AgentDefinitionStatus } from "@/generated/prisma/enums";
import { createDirectorTestFixture, cleanupAgentTestFixtures } from "../helpers/agent-fixtures";

const MEMORY_TARGET_RUNTIME_KEY = "test.director-memory-target";

/**
 * Test d'intégration (nécessite une vraie base PostgreSQL) : mémoire du
 * Director (v0.4) — conversation, décisions, préférences, contexte de
 * travail, résumés de run. Construite entièrement sur `setMemory`/
 * `getMemory` (v0.3, portée PERSISTENT) — voir `memory-helpers.ts`.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("mémoire de l'Agent Director", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];
  const definitionIds: string[] = [];

  beforeAll(() => {
    registerBuiltInAgentComponents();
    registerAgentRuntime({
      runtimeKey: MEMORY_TARGET_RUNTIME_KEY,
      async execute() {
        return { output: { ok: true } };
      },
    });
  });

  afterAll(async () => {
    await cleanupAgentTestFixtures(organizationIds, userIds, definitionIds);
  });

  async function setupDirector(suffix: string) {
    const fixture = await createDirectorTestFixture(suffix);
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    definitionIds.push(fixture.targetDefinition.id, fixture.directorDefinition.id);

    const directorInstallation = await installAgent(fixture.actor, {
      definitionId: fixture.directorDefinition.id,
      toolKeys: ["director.list_agents", "director.delegate_task", "director.cancel_task", "director.retry_task"],
      permissions: ["VIEW_WORKSPACE"],
    });
    await transitionInstallation(fixture.actor, directorInstallation.id, "activate");

    return { ...fixture, directorInstallation };
  }

  it("plafonne l'historique de conversation aux derniers tours, sans dupliquer les écritures", async () => {
    const { directorInstallation } = await setupDirector("memory-conversation");

    for (let i = 0; i < 55; i += 1) {
      await recordConversationTurn(directorInstallation, { role: i % 2 === 0 ? "user" : "director", content: `tour ${i}` });
    }

    const conversation = await listConversation(directorInstallation);
    expect(conversation.length).toBeLessThanOrEqual(50);
    expect(conversation[conversation.length - 1].content).toBe("tour 54");
    expect(conversation.some((turn) => turn.content === "tour 0")).toBe(false);
  });

  it("historise les décisions", async () => {
    const { directorInstallation } = await setupDirector("memory-decisions");

    await recordDecision(directorInstallation, { decision: "Décomposition heuristique automatique." });
    await recordDecision(directorInstallation, { decision: "Délégation à l'agent CRM.", reasoning: "catégorie correspondante" });

    const decisions = await listDecisions(directorInstallation);
    expect(decisions).toHaveLength(2);
    expect(decisions[1].reasoning).toBe("catégorie correspondante");
  });

  it("fusionne les préférences utilisateur (jamais remplacées entièrement)", async () => {
    const { directorInstallation } = await setupDirector("memory-preferences");

    await recordUserPreference(directorInstallation, "tone", "concis");
    await recordUserPreference(directorInstallation, "preferredAgentCategory", "crm");

    const preferences = await getPreferences(directorInstallation);
    expect(preferences).toEqual({ tone: "concis", preferredAgentCategory: "crm" });

    await recordUserPreference(directorInstallation, "tone", "détaillé");
    const updated = await getPreferences(directorInstallation);
    expect(updated).toEqual({ tone: "détaillé", preferredAgentCategory: "crm" });
  });

  it("remplace (ne fusionne pas) le contexte de travail à chaque écriture", async () => {
    const { directorInstallation } = await setupDirector("memory-context");

    await setWorkingContext(directorInstallation, { lastObjective: "A" });
    await setWorkingContext(directorInstallation, { lastObjective: "B" });

    const context = await getWorkingContext(directorInstallation);
    expect(context).toEqual({ lastObjective: "B" });
  });

  it("enregistre un résumé de run et une décision à chaque exécution complète du Director", async () => {
    const { actor, directorInstallation } = await setupDirector("memory-run-summary");

    const targetDefinition = await prisma.agentDefinition.create({
      data: {
        organizationId: null,
        key: "test-target-memory-run-summary",
        name: "Cible mémoire",
        author: "test",
        category: "system",
        status: AgentDefinitionStatus.PUBLISHED,
        runtimeKey: MEMORY_TARGET_RUNTIME_KEY,
        declaredToolKeys: [],
        declaredPermissions: [],
      },
    });
    definitionIds.push(targetDefinition.id);
    const target = await installAgent(actor, { definitionId: targetDefinition.id, toolKeys: [], permissions: [] });
    await transitionInstallation(actor, target.id, "activate");

    const run = await createAgentRun({
      installationId: directorInstallation.id,
      input: { objective: "objectif mémorisé", steps: [{ objective: "sous-tâche", targetInstallationId: target.id }] },
    });
    await executeAgentRun(run.id);

    const conversation = await listConversation(directorInstallation);
    expect(conversation.some((turn) => turn.role === "user" && turn.content === "objectif mémorisé")).toBe(true);
    expect(conversation.some((turn) => turn.role === "director")).toBe(true);

    const decisions = await listDecisions(directorInstallation);
    expect(decisions.length).toBeGreaterThan(0);

    const summaries = await listRunSummaries(directorInstallation);
    expect(summaries.some((summary) => summary.runId === run.id && summary.status === "SUCCEEDED")).toBe(true);
  });
});
