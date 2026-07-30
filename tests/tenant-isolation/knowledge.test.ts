import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import { KnowledgeSourceType } from "@/generated/prisma/enums";
import { ingestDocument, deleteDocument, reindexDocument } from "@/lib/knowledge/indexing-engine";
import { searchKnowledge } from "@/lib/knowledge/search";
import { setMemoryEntry, listMemoryEntries } from "@/lib/memory/memory-engine";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";
import { expectNoCrossTenantLeak } from "../helpers/tenant-isolation";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

/**
 * Isolation multi-tenant du système d'intelligence documentaire (v0.7) :
 * Knowledge Engine et Memory Engine — même gabarit que
 * `tests/tenant-isolation/commercial.test.ts` (v0.5).
 */
runIfDatabase("isolation multi-tenant — Knowledge Engine & Memory Engine", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  it("la recherche (plein texte/vectorielle/hybride) ne renvoie jamais un document d'une autre organisation", async () => {
    const fixtureA = await createWorkflowTestFixture("isolation-knowledge-a");
    organizationIds.push(fixtureA.organization.id);
    userIds.push(fixtureA.user.id);
    const fixtureB = await createWorkflowTestFixture("isolation-knowledge-b");
    organizationIds.push(fixtureB.organization.id);
    userIds.push(fixtureB.user.id);

    const docA = await ingestDocument({
      organizationId: fixtureA.organization.id,
      workspaceId: fixtureA.workspace.id,
      sourceType: KnowledgeSourceType.NOTE,
      sourceRef: "shared-topic",
      raw: "Studio de visites virtuelles 360 pour hôtels et restaurants.",
    });
    const docB = await ingestDocument({
      organizationId: fixtureB.organization.id,
      workspaceId: fixtureB.workspace.id,
      sourceType: KnowledgeSourceType.NOTE,
      sourceRef: "shared-topic",
      raw: "Studio de visites virtuelles 360 pour hôtels et restaurants.",
    });

    await expectNoCrossTenantLeak({
      actorAItems: async () => {
        const matches = await searchKnowledge("visites virtuelles hôtels", { organizationId: fixtureA.organization.id }, { mode: "hybrid" });
        return matches;
      },
      actorBItems: async () => {
        const matches = await searchKnowledge("visites virtuelles hôtels", { organizationId: fixtureB.organization.id }, { mode: "hybrid" });
        return matches;
      },
      actorAOwnResourceId: docA.id,
      actorBOwnResourceId: docB.id,
      getId: (m) => m.documentId,
    });
  });

  it("les opérations d'indexation (suppression/réindexation) échouent avec NotFoundError sur un document d'une autre organisation", async () => {
    const fixtureA = await createWorkflowTestFixture("isolation-knowledge-ops-a");
    organizationIds.push(fixtureA.organization.id);
    userIds.push(fixtureA.user.id);
    const fixtureB = await createWorkflowTestFixture("isolation-knowledge-ops-b");
    organizationIds.push(fixtureB.organization.id);
    userIds.push(fixtureB.user.id);

    const docA = await ingestDocument({
      organizationId: fixtureA.organization.id,
      workspaceId: fixtureA.workspace.id,
      sourceType: KnowledgeSourceType.NOTE,
      sourceRef: "note-isolation",
      raw: "Document appartenant strictement à l'organisation A.",
    });

    await expect(
      reindexDocument(docA.id, { organizationId: fixtureB.organization.id, workspaceId: fixtureB.workspace.id })
    ).rejects.toThrow(NotFoundError);
    await expect(
      deleteDocument(docA.id, { organizationId: fixtureB.organization.id, workspaceId: fixtureB.workspace.id })
    ).rejects.toThrow(NotFoundError);

    // toujours indexable depuis la bonne organisation, preuve que le refus ci-dessus n'était pas un faux positif
    const stillThere = await prisma.knowledgeDocument.findUniqueOrThrow({ where: { id: docA.id } });
    expect(stillThere.organizationId).toBe(fixtureA.organization.id);
  });

  it("la mémoire (Memory Engine) d'une organisation n'est jamais visible depuis une autre", async () => {
    const fixtureA = await createWorkflowTestFixture("isolation-memory-a");
    organizationIds.push(fixtureA.organization.id);
    userIds.push(fixtureA.user.id);
    const fixtureB = await createWorkflowTestFixture("isolation-memory-b");
    organizationIds.push(fixtureB.organization.id);
    userIds.push(fixtureB.user.id);

    await setMemoryEntry({
      organizationId: fixtureA.organization.id,
      scopeType: "ORGANIZATION",
      scopeId: fixtureA.organization.id,
      kind: "DECISION",
      key: "shared-key",
      value: { secret: "confidentiel A" },
    });
    await setMemoryEntry({
      organizationId: fixtureB.organization.id,
      scopeType: "ORGANIZATION",
      scopeId: fixtureB.organization.id,
      kind: "DECISION",
      key: "shared-key",
      value: { secret: "confidentiel B" },
    });

    const seenByA = await listMemoryEntries({ organizationId: fixtureA.organization.id, kind: "DECISION" });
    const seenByB = await listMemoryEntries({ organizationId: fixtureB.organization.id, kind: "DECISION" });

    expect(seenByA.every((e) => e.organizationId === fixtureA.organization.id)).toBe(true);
    expect(seenByB.every((e) => e.organizationId === fixtureB.organization.id)).toBe(true);
    expect(seenByA.some((e) => (e.value as { secret: string }).secret === "confidentiel B")).toBe(false);
    expect(seenByB.some((e) => (e.value as { secret: string }).secret === "confidentiel A")).toBe(false);
  });
});
