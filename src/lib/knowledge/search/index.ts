import "server-only";
import { fulltextSearch } from "./fulltext-search";
import { vectorSearch } from "./vector-search";
import { hybridSearch } from "./hybrid-search";
import { recordDocumentUsage } from "./usage";
import type { SearchScope, SearchMatch, SearchMode } from "./types";

/**
 * Point d'entrée unique des moteurs de recherche du Knowledge Engine
 * (v0.7) : plein texte, vectorielle, hybride (fusion de rangs
 * réciproques) et par similarité (`findSimilarChunks`, voir
 * `similarity-search.ts`). "Par organisation", "par workspace", "filtrée",
 * "par tags" et "multi-sources" sont couverts par un seul et même
 * paramètre de portée (`SearchScope`), pas par un moteur séparé chacun.
 * "Par permissions" : l'autorisation d'appeler cette couche du tout
 * (rôle/permission de l'utilisateur courant) reste la responsabilité de
 * l'appelant (route API) — même convention que tous les autres moteurs de
 * ce projet, aucun service ne fait de vérification de rôle en interne.
 */
export async function searchKnowledge(
  query: string,
  scope: SearchScope,
  options?: { mode?: SearchMode; limit?: number }
): Promise<SearchMatch[]> {
  const limit = options?.limit ?? 10;
  const results = await (async () => {
    switch (options?.mode ?? "hybrid") {
      case "fulltext":
        return fulltextSearch(query, scope, limit);
      case "vector":
        return vectorSearch(query, scope, limit);
      case "hybrid":
      default:
        return hybridSearch(query, scope, limit);
    }
  })();

  await recordDocumentUsage(results.map((r) => r.documentId));
  return results;
}

export * from "./types";
export { fulltextSearch } from "./fulltext-search";
export { vectorSearch } from "./vector-search";
export { hybridSearch } from "./hybrid-search";
export { findSimilarChunks } from "./similarity-search";
export { reciprocalRankFusion } from "./ranking";
export { recordDocumentUsage } from "./usage";
