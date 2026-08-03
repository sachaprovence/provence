import "server-only";

/**
 * Abstraction de base vectorielle (Knowledge Engine, v0.7) — même parti
 * pris que `LlmProvider`/`EmbeddingProvider` : un registre, une sélection
 * pilotée par variable d'environnement, aucun fournisseur choisi en dur.
 * `id` référence toujours un `KnowledgeChunk.id` — jamais un identifiant
 * propre à la base vectorielle externe, pour que la source de vérité
 * (Postgres) reste toujours consultable même si l'index externe est
 * indisponible ou reconstruit.
 */
export type VectorRecord = { id: string; vector: number[]; metadata: Record<string, unknown> };

export type VectorQueryOptions = {
  organizationId: string;
  workspaceId?: string;
  topK: number;
  documentIds?: string[];
  tags?: string[];
};

export type VectorQueryMatch = { id: string; score: number; metadata: Record<string, unknown> };

export interface VectorStore {
  readonly key: string;
  upsert(records: VectorRecord[]): Promise<void>;
  delete(ids: string[]): Promise<void>;
  query(vector: number[], options: VectorQueryOptions): Promise<VectorQueryMatch[]>;
}
