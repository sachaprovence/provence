import "server-only";
import { postJson } from "../http-helpers";
import type { VectorStore, VectorRecord, VectorQueryOptions, VectorQueryMatch } from "./types";

const DEFAULT_COLLECTION = "autorun_knowledge";

type ChromaQueryResponse = { ids: string[][]; distances: number[][]; metadatas: (Record<string, unknown> | null)[][] };

/** ChromaDB (serveur HTTP) — `CHROMA_URL` (défaut `http://localhost:8000`). Utilise l'API de collection v1 (id de collection résolu par nom à la première opération et mis en cache en mémoire). */
export class ChromaVectorStore implements VectorStore {
  readonly key = "chroma";
  private collectionId: string | null = null;

  private baseUrl() {
    return (process.env.CHROMA_URL ?? "http://localhost:8000").replace(/\/$/, "");
  }
  private collectionName() {
    return process.env.CHROMA_COLLECTION ?? DEFAULT_COLLECTION;
  }

  private async resolveCollectionId(): Promise<string> {
    if (this.collectionId) return this.collectionId;
    const created = await postJson<{ id: string }>(
      `${this.baseUrl()}/api/v1/collections`,
      { name: this.collectionName(), get_or_create: true },
      {}
    );
    this.collectionId = created.id;
    return created.id;
  }

  async upsert(records: VectorRecord[]): Promise<void> {
    const collectionId = await this.resolveCollectionId();
    await postJson(
      `${this.baseUrl()}/api/v1/collections/${collectionId}/upsert`,
      { ids: records.map((r) => r.id), embeddings: records.map((r) => r.vector), metadatas: records.map((r) => r.metadata) },
      {}
    );
  }

  async delete(ids: string[]): Promise<void> {
    const collectionId = await this.resolveCollectionId();
    await postJson(`${this.baseUrl()}/api/v1/collections/${collectionId}/delete`, { ids }, {});
  }

  async query(vector: number[], options: VectorQueryOptions): Promise<VectorQueryMatch[]> {
    const collectionId = await this.resolveCollectionId();
    const where: Record<string, unknown> = { organizationId: options.organizationId };
    const response = await postJson<ChromaQueryResponse>(
      `${this.baseUrl()}/api/v1/collections/${collectionId}/query`,
      { query_embeddings: [vector], n_results: options.topK, where },
      {}
    );
    const ids = response.ids[0] ?? [];
    const distances = response.distances[0] ?? [];
    const metadatas = response.metadatas[0] ?? [];
    return ids.map((id, i) => ({ id, score: 1 - distances[i], metadata: metadatas[i] ?? {} }));
  }
}
