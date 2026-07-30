import "server-only";
import type { KnowledgeSourceType } from "@/generated/prisma/enums";

/**
 * Pipeline d'ingestion extensible (Knowledge Engine, v0.7) : un
 * `DocumentParser` par `KnowledgeSourceType`, enregistré une fois — même
 * principe de registre que les autres moteurs (LLM v0.5, actions du
 * Workflow Engine v0.6). `ctx` porte toujours l'organisation/workspace de
 * l'appelant : un parseur de source DB (CRM, devis, conversation...) doit
 * systématiquement scoper sa lecture par cette double portée, jamais
 * faire confiance à `sourceRef` seul (voir ADR 0026, sécurité).
 */
export type ParseContext = { organizationId: string; workspaceId: string };
export type ParseInput = { raw?: string; sourceRef?: string; title?: string };
export type ParsedDocument = { title: string; content: string; metadata?: Record<string, unknown> };

export interface DocumentParser {
  readonly sourceType: KnowledgeSourceType;
  parse(input: ParseInput, ctx: ParseContext): Promise<ParsedDocument>;
}
