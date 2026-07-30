import "server-only";
import { fulltextSearch } from "./fulltext-search";
import { vectorSearch } from "./vector-search";
import { reciprocalRankFusion } from "./ranking";
import type { SearchScope, SearchMatch } from "./types";

/**
 * Recherche hybride : combine plein texte et vectorielle par fusion de
 * rangs réciproques — plus robuste qu'un seul moteur (le plein texte
 * rattrape les termes exacts/rares que le vectoriel peut lisser, le
 * vectoriel rattrape les reformulations que le plein texte manque).
 * Mode par défaut de `searchKnowledge` (voir `index.ts`).
 */
export async function hybridSearch(query: string, scope: SearchScope, limit: number = 10): Promise<SearchMatch[]> {
  const overfetch = limit * 3;
  const [fulltext, vector] = await Promise.all([fulltextSearch(query, scope, overfetch), vectorSearch(query, scope, overfetch)]);
  return reciprocalRankFusion([fulltext, vector], 60).slice(0, limit);
}
