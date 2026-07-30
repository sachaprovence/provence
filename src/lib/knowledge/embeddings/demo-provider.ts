import "server-only";
import type { EmbeddingProvider, EmbeddingResult } from "./types";

const DEMO_DIMENSIONS = 64;

/**
 * Fournisseur d'embeddings par défaut, sans réseau ni clé API — même rôle
 * que `DemoLlmProvider` (v0.5). Utilise le "hashing trick" (les mots sont
 * hachés dans un nombre fixe de compartiments, puis le vecteur est
 * normalisé) : un vrai algorithme, déterministe et reproductible, mais
 * volontairement non sémantique (deux synonymes n'ont aucune raison
 * d'être proches) — suffisant pour faire fonctionner la recherche
 * vectorielle et la démonstration de bout en bout sans dépendance
 * externe, jamais présenté comme une alternative sémantique aux vrais
 * fournisseurs.
 */
function hashToken(token: string): number {
  let hash = 0;
  for (let i = 0; i < token.length; i += 1) {
    hash = (hash * 31 + token.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function embedOne(text: string): number[] {
  const vector = new Array(DEMO_DIMENSIONS).fill(0);
  const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);
  for (const token of tokens) {
    vector[hashToken(token) % DEMO_DIMENSIONS] += 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map((v) => v / norm);
}

export class DemoEmbeddingProvider implements EmbeddingProvider {
  readonly key = "demo";
  readonly defaultModel = "demo-hashing-64";

  async embed(texts: string[]): Promise<EmbeddingResult> {
    return {
      vectors: texts.map(embedOne),
      provider: this.key,
      model: this.defaultModel,
      dimensions: DEMO_DIMENSIONS,
    };
  }
}
