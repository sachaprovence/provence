import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { ValidationError, ForbiddenError, NotFoundError } from "@/lib/errors";
import {
  createCustomAgent,
  listCustomAgents,
  resolveCustomAgentOrThrow,
  updateCustomAgent,
  archiveCustomAgent,
  createConversation,
  listConversations,
  resolveConversationOrThrow,
  sendMessage,
  runTool,
  listAvailableTools,
  listAvailableLlmProviders,
} from "@/lib/agents/custom/custom-agent-service";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";

/**
 * Agents personnalisés (v1.6-1 à -4) : CRUD, validation (fournisseur/outils
 * connus), chat (réponse du fournisseur démo + mémoire persistée),
 * exécution explicite d'un outil autorisé, et isolation multi-tenant
 * stricte sur chaque opération.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("custom-agent-service (v1.6)", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  describe("createCustomAgent", () => {
    it("crée un agent avec les valeurs par défaut (fournisseur demo, mémoire activée)", async () => {
      const fixture = await createWorkflowTestFixture("custom-agent-create");
      organizationIds.push(fixture.organization.id);
      userIds.push(fixture.user.id);

      const agent = await createCustomAgent(fixture.actor, { name: "Mon agent" });
      expect(agent.providerKey).toBe("demo");
      expect(agent.memoryEnabled).toBe(true);
      expect(agent.workspaceId).toBe(fixture.workspace.id);
      expect(agent.organizationId).toBe(fixture.organization.id);
    });

    it("rejette un nom trop court", async () => {
      const fixture = await createWorkflowTestFixture("custom-agent-name-invalid");
      organizationIds.push(fixture.organization.id);
      userIds.push(fixture.user.id);

      await expect(createCustomAgent(fixture.actor, { name: "A" })).rejects.toThrow(ValidationError);
    });

    it("rejette un fournisseur LLM inconnu", async () => {
      const fixture = await createWorkflowTestFixture("custom-agent-provider-invalid");
      organizationIds.push(fixture.organization.id);
      userIds.push(fixture.user.id);

      await expect(createCustomAgent(fixture.actor, { name: "Agent", providerKey: "openai-inexistant" })).rejects.toThrow(
        ValidationError
      );
    });

    it("rejette un outil inconnu", async () => {
      const fixture = await createWorkflowTestFixture("custom-agent-tool-invalid");
      organizationIds.push(fixture.organization.id);
      userIds.push(fixture.user.id);

      await expect(createCustomAgent(fixture.actor, { name: "Agent", toolKeys: ["outil.inexistant"] })).rejects.toThrow(
        ValidationError
      );
    });
  });

  describe("listCustomAgents + resolveCustomAgentOrThrow", () => {
    it("liste seulement les agents du workspace de l'acteur, jamais ceux d'une autre organisation", async () => {
      const fixtureA = await createWorkflowTestFixture("custom-agent-list-a");
      const fixtureB = await createWorkflowTestFixture("custom-agent-list-b");
      organizationIds.push(fixtureA.organization.id, fixtureB.organization.id);
      userIds.push(fixtureA.user.id, fixtureB.user.id);

      await createCustomAgent(fixtureA.actor, { name: "Agent A" });
      await createCustomAgent(fixtureB.actor, { name: "Agent B" });

      const listA = await listCustomAgents(fixtureA.actor);
      expect(listA.map((a) => a.name)).toEqual(["Agent A"]);
    });

    it("refuse de résoudre un agent d'une autre organisation (isolation multi-tenant)", async () => {
      const fixtureA = await createWorkflowTestFixture("custom-agent-resolve-a");
      const fixtureB = await createWorkflowTestFixture("custom-agent-resolve-b");
      organizationIds.push(fixtureA.organization.id, fixtureB.organization.id);
      userIds.push(fixtureA.user.id, fixtureB.user.id);

      const agentB = await createCustomAgent(fixtureB.actor, { name: "Agent B" });
      await expect(resolveCustomAgentOrThrow(fixtureA.actor, agentB.id)).rejects.toThrow(NotFoundError);
    });
  });

  describe("updateCustomAgent + archiveCustomAgent", () => {
    it("met à jour les champs fournis et archive", async () => {
      const fixture = await createWorkflowTestFixture("custom-agent-update");
      organizationIds.push(fixture.organization.id);
      userIds.push(fixture.user.id);

      const agent = await createCustomAgent(fixture.actor, { name: "Agent" });
      const updated = await updateCustomAgent(fixture.actor, agent.id, { name: "Agent renommé", memoryEnabled: false });
      expect(updated.name).toBe("Agent renommé");
      expect(updated.memoryEnabled).toBe(false);

      const archived = await archiveCustomAgent(fixture.actor, agent.id);
      expect(archived.archivedAt).not.toBeNull();

      const listWithoutArchived = await listCustomAgents(fixture.actor);
      expect(listWithoutArchived).toHaveLength(0);
    });
  });

  describe("chat (sendMessage) + mémoire", () => {
    it("répond via le fournisseur démo et persiste le message utilisateur + la réponse", async () => {
      const fixture = await createWorkflowTestFixture("custom-agent-chat");
      organizationIds.push(fixture.organization.id);
      userIds.push(fixture.user.id);

      const agent = await createCustomAgent(fixture.actor, { name: "Agent chat" });
      const conversation = await createConversation(fixture.actor, agent.id);
      const result = await sendMessage(fixture.actor, conversation.id, "Bonjour");

      expect(result.provider).toBe("demo");
      expect(result.assistantMessage.content).toContain("Bonjour");

      const messages = await prisma.customAgentChatMessage.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: "asc" } });
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe("USER");
      expect(messages[1].role).toBe("ASSISTANT");
    });

    it("persiste un résumé de mémoire après l'échange quand memoryEnabled est vrai", async () => {
      const fixture = await createWorkflowTestFixture("custom-agent-memory");
      organizationIds.push(fixture.organization.id);
      userIds.push(fixture.user.id);

      const agent = await createCustomAgent(fixture.actor, { name: "Agent mémoire", memoryEnabled: true });
      const conversation = await createConversation(fixture.actor, agent.id);
      await sendMessage(fixture.actor, conversation.id, "Retiens ceci");

      const memoryEntry = await prisma.memoryEntry.findFirst({
        where: { organizationId: fixture.organization.id, scopeType: "AGENT", scopeId: agent.id, isCurrent: true },
      });
      expect(memoryEntry).not.toBeNull();
      expect((memoryEntry!.value as { summary: string }).summary).toContain("Retiens ceci");
    });

    it("refuse de résoudre une conversation d'une autre organisation", async () => {
      const fixtureA = await createWorkflowTestFixture("custom-agent-chat-isolation-a");
      const fixtureB = await createWorkflowTestFixture("custom-agent-chat-isolation-b");
      organizationIds.push(fixtureA.organization.id, fixtureB.organization.id);
      userIds.push(fixtureA.user.id, fixtureB.user.id);

      const agentB = await createCustomAgent(fixtureB.actor, { name: "Agent B" });
      const conversationB = await createConversation(fixtureB.actor, agentB.id);

      await expect(resolveConversationOrThrow(fixtureA.actor, conversationB.id)).rejects.toThrow(NotFoundError);
      await expect(sendMessage(fixtureA.actor, conversationB.id, "Intrusion")).rejects.toThrow(NotFoundError);
    });
  });

  describe("runTool", () => {
    it("exécute un outil explicitement autorisé et enregistre un message TOOL", async () => {
      const fixture = await createWorkflowTestFixture("custom-agent-tool-run");
      organizationIds.push(fixture.organization.id);
      userIds.push(fixture.user.id);

      const agent = await createCustomAgent(fixture.actor, { name: "Agent outil", toolKeys: ["system.datetime"] });
      const conversation = await createConversation(fixture.actor, agent.id);

      const result = await runTool(fixture.actor, conversation.id, "system.datetime", {});
      expect(result.message.role).toBe("TOOL");
      expect(result.output).toHaveProperty("iso");
    });

    it("refuse un outil non autorisé pour cet agent", async () => {
      const fixture = await createWorkflowTestFixture("custom-agent-tool-forbidden");
      organizationIds.push(fixture.organization.id);
      userIds.push(fixture.user.id);

      const agent = await createCustomAgent(fixture.actor, { name: "Agent sans outil", toolKeys: [] });
      const conversation = await createConversation(fixture.actor, agent.id);

      await expect(runTool(fixture.actor, conversation.id, "system.datetime", {})).rejects.toThrow(ForbiddenError);
    });
  });

  describe("listConversations", () => {
    it("isole les conversations par workspace", async () => {
      const fixtureA = await createWorkflowTestFixture("custom-agent-conv-list-a");
      organizationIds.push(fixtureA.organization.id);
      userIds.push(fixtureA.user.id);

      const agent = await createCustomAgent(fixtureA.actor, { name: "Agent" });
      await createConversation(fixtureA.actor, agent.id, "Conv 1");
      await createConversation(fixtureA.actor, agent.id, "Conv 2");

      const conversations = await listConversations(fixtureA.actor, agent.id);
      expect(conversations).toHaveLength(2);
    });
  });

  describe("catalogues", () => {
    it("liste les outils actifs et les fournisseurs LLM enregistrés", async () => {
      const tools = await listAvailableTools();
      expect(tools.length).toBeGreaterThan(0);

      const providers = listAvailableLlmProviders();
      expect(providers.some((p) => p.key === "demo")).toBe(true);
    });
  });
});
