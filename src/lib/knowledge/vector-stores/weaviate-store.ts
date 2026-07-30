import "server-only";
import { postJson } from "../http-helpers";
import type { VectorStore, VectorRecord, VectorQueryOptions, VectorQueryMatch } from "./types";

const DEFAULT_CLASS = "AutorunKnowledgeChunk";

type WeaviateGraphQlResponse = {
  data?: {
    Get?: Record<string, { _additional: { id: string; certainty?: number }; organizationId: string; documentId: string }[]>;
  };
  errors?: { message: string }[];
};

/** Weaviate (REST + GraphQL) — `WEAVIATE_URL` (défaut `http://localhost:8080`), `WEAVIATE_API_KEY` optionnelle. La recherche vectorielle de Weaviate n'existe qu'en GraphQL (`nearVector`), pas en REST — la requête est construite ici en texte, pas de client GraphQL ajouté en dépendance. */
export class WeaviateVectorStore implements VectorStore {
  readonly key = "weaviate";

  private baseUrl() {
    return (process.env.WEAVIATE_URL ?? "http://localhost:8080").replace(/\/$/, "");
  }
  private headers(): Record<string, string> {
    const apiKey = process.env.WEAVIATE_API_KEY;
    return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  }
  private className() {
    return process.env.WEAVIATE_CLASS ?? DEFAULT_CLASS;
  }

  async upsert(records: VectorRecord[]): Promise<void> {
    await postJson(
      `${this.baseUrl()}/v1/batch/objects`,
      {
        objects: records.map((r) => ({
          class: this.className(),
          id: r.id,
          vector: r.vector,
          properties: r.metadata,
        })),
      },
      this.headers()
    );
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) {
      await fetch(`${this.baseUrl()}/v1/objects/${this.className()}/${id}`, { method: "DELETE", headers: this.headers() });
    }
  }

  async query(vector: number[], options: VectorQueryOptions): Promise<VectorQueryMatch[]> {
    const where = `where: { path: ["organizationId"], operator: Equal, valueText: "${options.organizationId}" }`;
    const query = `{
      Get {
        ${this.className()}(
          nearVector: { vector: ${JSON.stringify(vector)} }
          limit: ${options.topK}
          ${where}
        ) {
          organizationId
          documentId
          _additional { id certainty }
        }
      }
    }`;

    const response = await postJson<WeaviateGraphQlResponse>(`${this.baseUrl()}/v1/graphql`, { query }, this.headers());
    if (response.errors?.length) {
      throw new Error(`Requête Weaviate invalide : ${response.errors.map((e) => e.message).join("; ")}`);
    }
    const rows = response.data?.Get?.[this.className()] ?? [];
    return rows.map((row) => ({
      id: row._additional.id,
      score: row._additional.certainty ?? 0,
      metadata: { documentId: row.documentId, organizationId: row.organizationId },
    }));
  }
}
