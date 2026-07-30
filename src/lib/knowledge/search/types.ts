import "server-only";
import type { KnowledgeSourceType } from "@/generated/prisma/enums";

/**
 * Portée d'une recherche : couvre à elle seule "par organisation", "par
 * workspace", "filtrée", "par tags" et "multi-sources" du cahier des
 * charges — un seul paramètre de portée pour tous les moteurs plutôt
 * qu'un mécanisme de filtrage par moteur. `organizationId` est toujours
 * obligatoire (jamais de recherche inter-organisations).
 */
export type SearchScope = {
  organizationId: string;
  workspaceId?: string;
  sourceTypes?: KnowledgeSourceType[];
  tags?: string[];
  documentIds?: string[];
};

export type SearchMatch = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  sourceType: KnowledgeSourceType;
  tags: string[];
  chunkIndex: number;
  content: string;
  score: number;
};

export type SearchMode = "fulltext" | "vector" | "hybrid";
