import "server-only";

/**
 * Abstraction générique de vectorisation (Knowledge Engine, v0.7) —
 * même parti pris que `LlmProvider` (v0.5, ADR 0015) : aucun fournisseur
 * choisi en dur, un registre + une sélection pilotée par variable
 * d'environnement, chaque adaptateur réel lève une erreur explicite à
 * l'appel (jamais à l'enregistrement) s'il n'est pas configuré.
 */
export type EmbeddingResult = {
  vectors: number[][];
  provider: string;
  model: string;
  dimensions: number;
};

export interface EmbeddingProvider {
  readonly key: string;
  readonly defaultModel: string;
  embed(texts: string[], model?: string): Promise<EmbeddingResult>;
}
