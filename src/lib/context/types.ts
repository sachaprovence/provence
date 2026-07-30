import "server-only";
import type { KnowledgeSourceType } from "@/generated/prisma/enums";

/**
 * Context Engine (v0.7) — types partagés. Voir `context-engine.ts` pour
 * l'orchestration : c'est le seul moteur qui doit être appelé avant tout
 * appel à un LLM ("Aucun agent ne devra gérer lui-même sa mémoire ou son
 * contexte" — brief v0.7).
 */
export type ContextRequest = {
  organizationId: string;
  workspaceId?: string;
  /** La question/l'objectif pour lequel on assemble un contexte — pilote la recherche documentaire (Knowledge Engine). */
  query: string;
  /** Mémoire niveau utilisateur (préférences) — omis si l'appel n'est pas attribuable à un utilisateur précis. */
  userScopeId?: string;
  /** Mémoire niveau conversation (historique) — voir `MemoryScopeType.CONVERSATION`. */
  conversationScopeId?: string;
  /** Mémoire niveau tâche (résultats précédents) — voir `MemoryScopeType.TASK`. */
  taskScopeId?: string;
  /** Mémoire niveau agent (état propre à l'agent appelant, distinct de `AgentMemoryEntry` v0.3 — voir ADR 0023). */
  agentScopeId?: string;
  /** Restreint la recherche documentaire à certains types de sources ; omis = toutes ("multi-sources"). */
  sourceTypes?: KnowledgeSourceType[];
  /** Nombre maximal de documents retenus par la recherche (défaut 8). */
  maxDocuments?: number;
  /** Budget de sortie approximatif, en tokens (défaut 2000 ; déclenche la compression si dépassé). */
  maxTokens?: number;
  /**
   * Contraintes métier à faire figurer dans le contexte, fournies par
   * l'appelant (agent/workflow) — ce moteur les *sélectionne et assemble*,
   * il ne les génère pas : les déterminer relève du domaine métier de
   * l'appelant, pas d'une heuristique générique.
   */
  businessConstraints?: string[];
};

export type ContextSectionKind =
  | "constraint"
  | "preference"
  | "agent-memory"
  | "document"
  | "decision"
  | "previous-result"
  | "history";

export type ContextSection = {
  kind: ContextSectionKind;
  label: string;
  content: string;
  score?: number;
};

export type AssembledContext = {
  sections: ContextSection[];
  text: string;
  compressed: boolean;
  tokenEstimate: number;
};
