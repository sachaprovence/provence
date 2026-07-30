import { afterAll, describe, expect, it } from "vitest";
import { KnowledgeSourceType } from "@/generated/prisma/enums";
import { ingestDocument } from "@/lib/knowledge/indexing-engine";
import { setMemoryEntry } from "@/lib/memory/memory-engine";
import { assembleContext } from "@/lib/context/context-engine";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Context Engine", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  it("assemble et priorise : contraintes > préférences > documents > décisions > résultats précédents > historique", async () => {
    const fixture = await createWorkflowTestFixture("context-priority");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    await ingestDocument({
      organizationId: fixture.organization.id,
      workspaceId: fixture.workspace.id,
      sourceType: KnowledgeSourceType.NOTE,
      sourceRef: "doc-context",
      raw: "Le studio propose des visites virtuelles à 360 degrés pour les hôtels.",
    });
    await setMemoryEntry({
      organizationId: fixture.organization.id,
      scopeType: "USER",
      scopeId: fixture.user.id,
      kind: "PREFERENCE",
      key: "tone",
      value: { tone: "formel" },
    });
    await setMemoryEntry({
      organizationId: fixture.organization.id,
      scopeType: "ORGANIZATION",
      scopeId: fixture.organization.id,
      kind: "DECISION",
      key: "pricing-2026",
      value: { decision: "tarifs alignés sur le marché hôtelier" },
    });
    await setMemoryEntry({
      organizationId: fixture.organization.id,
      scopeType: "TASK",
      scopeId: "task-1",
      kind: "LONG_TERM",
      key: "last-run",
      value: { outcome: "devis envoyé" },
    });
    await setMemoryEntry({
      organizationId: fixture.organization.id,
      scopeType: "CONVERSATION",
      scopeId: "conv-1",
      kind: "LONG_TERM",
      key: "turn-1",
      value: { message: "Bonjour, je cherche un prestataire 360." },
    });

    const context = await assembleContext({
      organizationId: fixture.organization.id,
      workspaceId: fixture.workspace.id,
      query: "visite virtuelle hôtel",
      userScopeId: fixture.user.id,
      taskScopeId: "task-1",
      conversationScopeId: "conv-1",
      businessConstraints: ["Ne jamais promettre un délai de livraison inférieur à 48h."],
    });

    const kinds = context.sections.map((s) => s.kind);
    const priorityOrder = ["constraint", "preference", "document", "decision", "previous-result", "history"];
    const indices = kinds.map((k) => priorityOrder.indexOf(k));
    expect(indices).toEqual([...indices].sort((a, b) => a - b));

    expect(kinds).toContain("constraint");
    expect(kinds).toContain("preference");
    expect(kinds).toContain("document");
    expect(kinds).toContain("decision");
    expect(kinds).toContain("previous-result");
    expect(kinds).toContain("history");
    expect(context.text).toMatch(/48h/);
    expect(context.compressed).toBe(false);
  });

  it("compresse le contexte quand il dépasse le budget demandé", async () => {
    const fixture = await createWorkflowTestFixture("context-compress");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    for (let i = 0; i < 5; i += 1) {
      await ingestDocument({
        organizationId: fixture.organization.id,
        workspaceId: fixture.workspace.id,
        sourceType: KnowledgeSourceType.NOTE,
        sourceRef: `doc-compress-${i}`,
        raw: `Document numéro ${i} : ${"contenu détaillé sur les visites virtuelles 360 degrés ".repeat(20)}`,
      });
    }

    const context = await assembleContext({
      organizationId: fixture.organization.id,
      workspaceId: fixture.workspace.id,
      query: "visites virtuelles 360 degrés",
      maxDocuments: 5,
      maxTokens: 50,
    });

    expect(context.compressed).toBe(true);
    expect(context.text.length).toBeGreaterThan(0);
  });

  it("sans aucun scope optionnel fourni, n'assemble que les documents et contraintes explicites", async () => {
    const fixture = await createWorkflowTestFixture("context-minimal");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    await ingestDocument({
      organizationId: fixture.organization.id,
      workspaceId: fixture.workspace.id,
      sourceType: KnowledgeSourceType.NOTE,
      sourceRef: "doc-minimal",
      raw: "Contenu isolé pour un contexte minimal.",
    });

    const context = await assembleContext({
      organizationId: fixture.organization.id,
      workspaceId: fixture.workspace.id,
      query: "contexte minimal",
    });

    expect(context.sections.every((s) => s.kind === "document" || s.kind === "constraint")).toBe(true);
  });
});
