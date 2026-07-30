import { afterAll, describe, expect, it } from "vitest";
import { KnowledgeSourceType } from "@/generated/prisma/enums";
import { ingestDocument } from "@/lib/knowledge/indexing-engine";
import { fulltextSearch, vectorSearch, hybridSearch, searchKnowledge, findSimilarChunks } from "@/lib/knowledge/search";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Search engines", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  async function seedFixture(suffix: string) {
    const fixture = await createWorkflowTestFixture(suffix);
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const scope = { organizationId: fixture.organization.id, workspaceId: fixture.workspace.id };

    const catDoc = await ingestDocument({
      ...scope,
      sourceType: KnowledgeSourceType.NOTE,
      sourceRef: "note-chat",
      raw: "Le chat noir dort paisiblement sur le tapis rouge du salon.",
      tags: ["public"],
    });
    const dogDoc = await ingestDocument({
      ...scope,
      sourceType: KnowledgeSourceType.MARKDOWN,
      sourceRef: "note-chien",
      raw: "# Chien\n\nLe chien brun court joyeusement dans le jardin vert.",
      tags: ["private"],
    });

    return { fixture, scope, catDoc, dogDoc };
  }

  it("recherche plein texte : classe par fréquence des mots de la requête", async () => {
    const { scope, catDoc } = await seedFixture("search-fulltext");

    const results = await fulltextSearch("chat tapis", scope);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].documentId).toBe(catDoc.id);
  });

  it("recherche vectorielle : le document le plus proche sémantiquement (mots partagés) arrive en tête", async () => {
    const { scope, catDoc } = await seedFixture("search-vector");

    const results = await vectorSearch("chat noir tapis rouge", scope);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].documentId).toBe(catDoc.id);
  });

  it("recherche hybride : fusionne plein texte et vectoriel par fusion de rangs réciproques", async () => {
    const { scope, catDoc } = await seedFixture("search-hybrid");

    const results = await hybridSearch("chat tapis", scope);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].documentId).toBe(catDoc.id);
  });

  it("filtrée par tags : exclut les documents ne portant pas le tag demandé", async () => {
    const { scope, dogDoc } = await seedFixture("search-tags");

    const results = await searchKnowledge("chien jardin", { ...scope, tags: ["private"] }, { mode: "fulltext" });
    expect(results.every((r) => r.documentId === dogDoc.id)).toBe(true);
  });

  it("filtrée par type de source : exclut les autres types", async () => {
    const { scope, catDoc } = await seedFixture("search-source-type");

    const results = await searchKnowledge("chat chien", { ...scope, sourceTypes: [KnowledgeSourceType.NOTE] }, { mode: "fulltext" });
    expect(results.every((r) => r.sourceType === KnowledgeSourceType.NOTE)).toBe(true);
    expect(results.some((r) => r.documentId === catDoc.id)).toBe(true);
  });

  it("filtrée par documentIds : ne renvoie que les documents explicitement autorisés", async () => {
    const { scope, catDoc, dogDoc } = await seedFixture("search-document-ids");

    const results = await searchKnowledge("chat chien", { ...scope, documentIds: [catDoc.id] }, { mode: "hybrid" });
    expect(results.every((r) => r.documentId === catDoc.id)).toBe(true);
    expect(results.some((r) => r.documentId === dogDoc.id)).toBe(false);
  });

  it("isolation multi-tenant : un contenu identique dans une autre organisation ne fuite jamais", async () => {
    const { scope } = await seedFixture("search-tenant-a");
    const otherFixture = await createWorkflowTestFixture("search-tenant-b");
    organizationIds.push(otherFixture.organization.id);
    userIds.push(otherFixture.user.id);

    await ingestDocument({
      organizationId: otherFixture.organization.id,
      workspaceId: otherFixture.workspace.id,
      sourceType: KnowledgeSourceType.NOTE,
      sourceRef: "note-chat",
      raw: "Le chat noir dort paisiblement sur le tapis rouge du salon.",
    });

    const results = await searchKnowledge("chat tapis", scope, { mode: "hybrid" });
    expect(results.every((r) => r.chunkId)).toBe(true);
    for (const r of results) {
      const chunkOrg = await import("@/lib/prisma").then(({ prisma }) =>
        prisma.knowledgeChunk.findUnique({ where: { id: r.chunkId }, include: { document: true } })
      );
      expect(chunkOrg?.document.organizationId).toBe(scope.organizationId);
    }
  });

  it("recherche par similarité : trouve le voisin le plus proche et s'exclut lui-même", async () => {
    const { scope, catDoc, dogDoc } = await seedFixture("search-similarity");
    const { prisma } = await import("@/lib/prisma");
    const catChunk = await prisma.knowledgeChunk.findFirstOrThrow({ where: { documentId: catDoc.id } });

    const results = await findSimilarChunks(catChunk.id, scope);
    expect(results.every((r) => r.chunkId !== catChunk.id)).toBe(true);
    expect(results.some((r) => r.documentId === dogDoc.id)).toBe(true);
  });
});
