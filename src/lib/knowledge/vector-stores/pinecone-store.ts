import "server-only";
import { requireEnv, postJson } from "../http-helpers";
import type { VectorStore, VectorRecord, VectorQueryOptions, VectorQueryMatch } from "./types";

type PineconeQueryResponse = { matches: { id: string; score: number; metadata?: Record<string, unknown> }[] };

/** Pinecone (REST v1) — nécessite `PINECONE_API_KEY` et `PINECONE_HOST` (l'URL d'hôte propre à l'index, fournie par la console Pinecone). */
export class PineconeVectorStore implements VectorStore {
  readonly key = "pinecone";

  private headers() {
    return { "Api-Key": requireEnv("PINECONE_API_KEY", "Pinecone") };
  }
  private host() {
    return requireEnv("PINECONE_HOST", "Pinecone").replace(/\/$/, "");
  }

  async upsert(records: VectorRecord[]): Promise<void> {
    await postJson(
      `${this.host()}/vectors/upsert`,
      { vectors: records.map((r) => ({ id: r.id, values: r.vector, metadata: r.metadata })) },
      this.headers()
    );
  }

  async delete(ids: string[]): Promise<void> {
    await postJson(`${this.host()}/vectors/delete`, { ids }, this.headers());
  }

  async query(vector: number[], options: VectorQueryOptions): Promise<VectorQueryMatch[]> {
    const filter: Record<string, unknown> = { organizationId: options.organizationId };
    if (options.workspaceId) filter.workspaceId = options.workspaceId;
    if (options.documentIds) filter.documentId = { $in: options.documentIds };

    const response = await postJson<PineconeQueryResponse>(
      `${this.host()}/query`,
      { vector, topK: options.topK, filter, includeMetadata: true },
      this.headers()
    );
    return response.matches.map((m) => ({ id: m.id, score: m.score, metadata: m.metadata ?? {} }));
  }
}
