import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerBuiltInVectorStores } from "@/lib/knowledge/vector-stores";
import { listRegisteredVectorStoreKeys, getVectorStore } from "@/lib/knowledge/vector-stores/registry";
import { PgVectorStore } from "@/lib/knowledge/vector-stores/pgvector-store";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describe("Vector store registry", () => {
  it("registers all 8 anticipated backends (5 real + 3 honest stubs)", () => {
    registerBuiltInVectorStores();
    const keys = listRegisteredVectorStoreKeys();
    expect(keys.sort()).toEqual(["chroma", "faiss", "lancedb", "milvus", "pgvector", "pinecone", "qdrant", "weaviate"].sort());
  });

  it("the not-yet-implemented backends fail explicitly, never a fake success", async () => {
    registerBuiltInVectorStores();
    const milvus = getVectorStore("milvus")!;
    await expect(milvus.query([1, 2, 3], { organizationId: "x", topK: 5 })).rejects.toThrow(/n'est pas encore développée/);
  });
});

runIfDatabase("PgVectorStore (default, no external service required)", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  it("upsert stores the embedding on KnowledgeChunk, query ranks by cosine similarity", async () => {
    const fixture = await createWorkflowTestFixture("pgvector");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const document = await prisma.knowledgeDocument.create({
      data: {
        organizationId: fixture.organization.id,
        workspaceId: fixture.workspace.id,
        sourceType: "NOTE",
        title: "Doc de test",
      },
    });
    const chunkA = await prisma.knowledgeChunk.create({
      data: { documentId: document.id, chunkIndex: 0, content: "chunk proche" },
    });
    const chunkB = await prisma.knowledgeChunk.create({
      data: { documentId: document.id, chunkIndex: 1, content: "chunk lointain" },
    });

    const store = new PgVectorStore();
    await store.upsert([
      { id: chunkA.id, vector: [1, 0, 0], metadata: {} },
      { id: chunkB.id, vector: [0, 1, 0], metadata: {} },
    ]);

    const results = await store.query([1, 0, 0], {
      organizationId: fixture.organization.id,
      workspaceId: fixture.workspace.id,
      topK: 5,
    });

    expect(results[0].id).toBe(chunkA.id);
    expect(results[0].score).toBeCloseTo(1, 5);
    expect(results[1].id).toBe(chunkB.id);
    expect(results[1].score).toBeCloseTo(0, 5);
  });
});
