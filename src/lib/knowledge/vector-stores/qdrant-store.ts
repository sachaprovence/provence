import "server-only";
import { postJson } from "../http-helpers";
import type { VectorStore, VectorRecord, VectorQueryOptions, VectorQueryMatch } from "./types";

type QdrantSearchResponse = { result: { id: string; score: number; payload?: Record<string, unknown> }[] };

const DEFAULT_COLLECTION = "autorun_knowledge";

/** Qdrant (REST) — `QDRANT_URL` (défaut `http://localhost:6333`), `QDRANT_API_KEY` optionnelle (instance auto-hébergée sans authentification par défaut). */
export class QdrantVectorStore implements VectorStore {
  readonly key = "qdrant";

  private baseUrl() {
    return (process.env.QDRANT_URL ?? "http://localhost:6333").replace(/\/$/, "");
  }
  private headers(): Record<string, string> {
    const apiKey = process.env.QDRANT_API_KEY;
    return apiKey ? { "api-key": apiKey } : {};
  }
  private collection() {
    return process.env.QDRANT_COLLECTION ?? DEFAULT_COLLECTION;
  }

  async upsert(records: VectorRecord[]): Promise<void> {
    await postJson(
      `${this.baseUrl()}/collections/${this.collection()}/points`,
      { points: records.map((r) => ({ id: r.id, vector: r.vector, payload: r.metadata })) },
      this.headers()
    );
  }

  async delete(ids: string[]): Promise<void> {
    await postJson(`${this.baseUrl()}/collections/${this.collection()}/points/delete`, { points: ids }, this.headers());
  }

  async query(vector: number[], options: VectorQueryOptions): Promise<VectorQueryMatch[]> {
    const must: Record<string, unknown>[] = [{ key: "organizationId", match: { value: options.organizationId } }];
    if (options.workspaceId) must.push({ key: "workspaceId", match: { value: options.workspaceId } });

    const response = await postJson<QdrantSearchResponse>(
      `${this.baseUrl()}/collections/${this.collection()}/points/search`,
      { vector, limit: options.topK, filter: { must }, with_payload: true },
      this.headers()
    );
    return response.result.map((m) => ({ id: m.id, score: m.score, metadata: m.payload ?? {} }));
  }
}
