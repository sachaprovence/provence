import "server-only";
import type { SearchMatch } from "./types";

/**
 * Fusion de rangs réciproques (RRF) : combine plusieurs classements sans
 * avoir à normaliser des échelles de score hétérogènes (fréquence de mots
 * en plein texte, similarité cosinus en vectoriel). `k` amortit le poids
 * des rangs les plus bas — 60 est la valeur usuellement retenue dans la
 * littérature RRF.
 */
export function reciprocalRankFusion(rankedLists: SearchMatch[][], k: number = 60): SearchMatch[] {
  const fused = new Map<string, { match: SearchMatch; score: number }>();

  for (const list of rankedLists) {
    list.forEach((match, rank) => {
      const contribution = 1 / (k + rank + 1);
      const existing = fused.get(match.chunkId);
      if (existing) {
        existing.score += contribution;
      } else {
        fused.set(match.chunkId, { match, score: contribution });
      }
    });
  }

  return Array.from(fused.values())
    .sort((a, b) => b.score - a.score)
    .map(({ match, score }) => ({ ...match, score }));
}
