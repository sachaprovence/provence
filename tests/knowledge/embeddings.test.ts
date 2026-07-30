import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { embedTexts, clearEmbeddingCache } from "@/lib/knowledge/embeddings/embedding-service";
import { registerBuiltInEmbeddingProviders } from "@/lib/knowledge/embeddings";
import { listRegisteredEmbeddingProviderKeys } from "@/lib/knowledge/embeddings/registry";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describe("Embedding registry", () => {
  it("registers all 8 built-in providers (demo + 7 real adapters)", () => {
    registerBuiltInEmbeddingProviders();
    const keys = listRegisteredEmbeddingProviderKeys();
    expect(keys.sort()).toEqual(
      ["cohere", "demo", "huggingface", "jina", "nomic", "ollama", "openai", "voyageai"].sort()
    );
  });
});

runIfDatabase("Embedding service (demo provider)", () => {
  const organizationIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  beforeEach(() => {
    clearEmbeddingCache();
  });

  async function setupOrg(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org embeddings ${suffix}` } });
    organizationIds.push(organization.id);
    return organization;
  }

  it("produit des vecteurs déterministes et journalise un EmbeddingRequest", async () => {
    const org = await setupOrg("basic");
    const result = await embedTexts({ organizationId: org.id, texts: ["bonjour le monde", "au revoir"] });
    expect(result.vectors.length).toBe(2);
    expect(result.dimensions).toBeGreaterThan(0);
    expect(result.provider).toBe("demo");

    const logged = await prisma.embeddingRequest.findFirst({ where: { organizationId: org.id } });
    expect(logged?.inputCount).toBe(2);
    expect(logged?.cached).toBe(false);
  });

  it("réutilise le cache pour un texte déjà vectorisé (journalisé comme cached)", async () => {
    const org = await setupOrg("cache");
    await embedTexts({ organizationId: org.id, texts: ["texte répété"] });
    await embedTexts({ organizationId: org.id, texts: ["texte répété"] });

    const logs = await prisma.embeddingRequest.findMany({ where: { organizationId: org.id }, orderBy: { createdAt: "asc" } });
    expect(logs.length).toBe(2);
    expect(logs[0].cached).toBe(false);
    expect(logs[1].cached).toBe(true);
  });

  it("des textes similaires ont une similarité cosinus plus élevée que des textes différents", async () => {
    const org = await setupOrg("similarity");
    const result = await embedTexts({
      organizationId: org.id,
      texts: ["le chat noir dort", "le chat noir dort paisiblement", "recette de tarte aux pommes"],
    });

    function cosine(a: number[], b: number[]): number {
      const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
      const normA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
      const normB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
      return dot / (normA * normB || 1);
    }

    const simSimilar = cosine(result.vectors[0], result.vectors[1]);
    const simDifferent = cosine(result.vectors[0], result.vectors[2]);
    expect(simSimilar).toBeGreaterThan(simDifferent);
  });
});
