import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerLlmProvider } from "@/lib/agents/llm/registry";
import { registerBuiltInAgentComponents } from "@/lib/agents/bootstrap";
import { generateNarrative } from "@/lib/agents/commercial/generation";
import { ingestDocument } from "@/lib/knowledge/indexing-engine";
import { KnowledgeSourceType } from "@/generated/prisma/enums";
import type { LlmMessage, LlmProvider } from "@/lib/agents/llm/types";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

/**
 * Vérifie que l'Agent Commercial ne peut pas contourner le Context Engine
 * (v0.7) : `generateNarrative`, seul point d'appel IA du framework
 * aujourd'hui, doit systématiquement assembler et injecter le contexte
 * pertinent avant tout appel au fournisseur LLM actif — voir ADR 0029.
 */
runIfDatabase("Intégration Context Engine ↔ Agent Commercial", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(() => {
    registerBuiltInAgentComponents();
  });

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  it("injecte le contexte assemblé (documents indexés) dans les messages envoyés au LLM", async () => {
    const fixture = await createWorkflowTestFixture("ctx-integration");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    await ingestDocument({
      organizationId: fixture.organization.id,
      workspaceId: fixture.workspace.id,
      sourceType: KnowledgeSourceType.NOTE,
      sourceRef: "style-guide",
      raw: "Toujours signer les emails commerciaux avec la formule VISIOSPHERE360 STUDIO.",
    });

    let capturedMessages: LlmMessage[] = [];
    const captureProvider: LlmProvider = {
      key: "test-context-capture",
      defaultModel: "test-model",
      async complete(request) {
        capturedMessages = request.messages;
        return { text: "ok", provider: "test-context-capture", model: "test-model" };
      },
    };
    registerLlmProvider(captureProvider);

    const previousProviderEnv = process.env.LLM_PROVIDER;
    process.env.LLM_PROVIDER = "test-context-capture";
    try {
      await generateNarrative(
        "commercial.draft_email",
        { companyName: "Acme", sector: "hôtellerie", contactName: "Jean" },
        { organizationId: fixture.organization.id, workspaceId: fixture.workspace.id, agentScopeId: "agent-test-1" }
      );
    } finally {
      process.env.LLM_PROVIDER = previousProviderEnv;
    }

    const contextMessage = capturedMessages.find((m) => m.role === "system" && m.content.includes("Contexte pertinent"));
    expect(contextMessage).toBeDefined();
    expect(contextMessage?.content).toMatch(/VISIOSPHERE360 STUDIO/);
  });

  it("sans document ni mémoire pertinents, n'ajoute aucun message de contexte vide", async () => {
    const fixture = await createWorkflowTestFixture("ctx-integration-empty");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    let capturedMessages: LlmMessage[] = [];
    const captureProvider: LlmProvider = {
      key: "test-context-capture-empty",
      defaultModel: "test-model",
      async complete(request) {
        capturedMessages = request.messages;
        return { text: "ok", provider: "test-context-capture-empty", model: "test-model" };
      },
    };
    registerLlmProvider(captureProvider);

    const previousProviderEnv = process.env.LLM_PROVIDER;
    process.env.LLM_PROVIDER = "test-context-capture-empty";
    try {
      await generateNarrative(
        "commercial.draft_email",
        { companyName: "Acme Vide", sector: "test", contactName: "Jean" },
        { organizationId: fixture.organization.id, workspaceId: fixture.workspace.id, agentScopeId: "agent-test-empty" }
      );
    } finally {
      process.env.LLM_PROVIDER = previousProviderEnv;
    }

    expect(capturedMessages.some((m) => m.role === "system" && m.content.includes("Contexte pertinent"))).toBe(false);
  });
});
