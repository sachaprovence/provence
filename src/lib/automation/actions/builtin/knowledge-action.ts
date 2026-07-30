import "server-only";
import { ValidationError } from "@/lib/errors";
import { ingestDocument } from "@/lib/knowledge/indexing-engine";
import type { KnowledgeSourceType } from "@/generated/prisma/enums";
import type { AutomationJobHandler } from "../registry";

type KnowledgeIndexInput = {
  sourceType: KnowledgeSourceType;
  sourceRef?: string;
  raw?: string;
  title?: string;
  tags?: string[];
};

/** Point d'intégration avec le Knowledge Engine (v0.7, non modifié) : réutilise directement `ingestDocument`. */
export const knowledgeIndexAction: AutomationJobHandler<KnowledgeIndexInput, { documentId: string; status: string }> = {
  key: "knowledge.index",
  name: "Indexer un document",
  description: "Ajoute ou met à jour un document dans le Knowledge Engine (v0.7).",
  category: "connaissance",
  async execute(input, context) {
    if (!input.sourceType) throw new ValidationError('Le job "knowledge.index" nécessite "sourceType".');
    const document = await ingestDocument({
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      sourceType: input.sourceType,
      sourceRef: input.sourceRef,
      raw: input.raw,
      title: input.title,
      tags: input.tags,
    });
    await context.log("info", `Document "${document.id}" indexé (${document.status}).`);
    return { documentId: document.id, status: document.status };
  },
};
