import "server-only";
import { logger } from "@/lib/logger";
import type { KnowledgeSourceType } from "@/generated/prisma/enums";
import type { DocumentParser } from "./types";

const parsers = new Map<KnowledgeSourceType, DocumentParser>();

export function registerDocumentParser(parser: DocumentParser): void {
  if (parsers.has(parser.sourceType)) {
    logger.debug({ sourceType: parser.sourceType }, "Parseur de document réenregistré (remplace le précédent).");
  }
  parsers.set(parser.sourceType, parser);
}

export function getDocumentParser(sourceType: KnowledgeSourceType): DocumentParser | undefined {
  return parsers.get(sourceType);
}

export function listRegisteredParserSourceTypes(): KnowledgeSourceType[] {
  return Array.from(parsers.keys());
}
