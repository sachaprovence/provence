import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { KnowledgeDocumentStatus, KnowledgeIndexAction, type KnowledgeSourceType } from "@/generated/prisma/enums";
import { registerBuiltInDocumentParsers, getDocumentParser } from "./parsers";
import { chunkText } from "./chunking";
import { embedTexts } from "./embeddings/embedding-service";
import { getActiveVectorStore } from "./vector-stores";

/**
 * Moteur d'indexation (Knowledge Engine, v0.7) : seul point d'entrée pour
 * faire passer un document (fichier ou enregistrement) de sa source brute
 * à un ensemble de fragments vectorisés et interrogeables. Orchestre, dans
 * l'ordre : résolution du `DocumentParser` (voir `parsers/`) → calcul d'une
 * empreinte (`checksum`) pour détecter automatiquement l'absence de
 * changement (réindexation incrémentale : ne recalcule jamais des
 * embeddings pour un contenu identique) → découpage (`chunkText`) →
 * vectorisation (`embedTexts`) → écriture dans la base vectorielle active
 * (`getActiveVectorStore`) → journalisation systématique
 * (`KnowledgeIndexLog`, y compris en cas d'échec).
 *
 * Chaque opération est strictement scopée par organisation/workspace —
 * jamais par un `documentId` seul (voir ADR 0026).
 */

type Scope = { organizationId: string; workspaceId: string };

function checksumOf(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function writeIndexLog(params: {
  documentId?: string;
  workspaceId: string;
  action: KnowledgeIndexAction;
  priority?: number;
  success: boolean;
  message?: string;
  durationMs: number;
}): Promise<void> {
  await prisma.knowledgeIndexLog.create({
    data: {
      documentId: params.documentId,
      workspaceId: params.workspaceId,
      action: params.action,
      priority: params.priority ?? 0,
      success: params.success,
      message: params.message,
      durationMs: params.durationMs,
    },
  });
}

/**
 * Re-fragmente et re-vectorise intégralement un document : supprime les
 * anciens fragments (base vectorielle puis Postgres) avant d'en recréer de
 * nouveaux, pour ne jamais laisser de fragments orphelins d'une version
 * précédente du contenu.
 */
async function chunkAndEmbed(
  document: { id: string; organizationId: string; workspaceId: string; tags: string[] },
  content: string
): Promise<void> {
  const vectorStore = getActiveVectorStore();

  const existingChunks = await prisma.knowledgeChunk.findMany({ where: { documentId: document.id }, select: { id: true } });
  if (existingChunks.length > 0) {
    await vectorStore.delete(existingChunks.map((c) => c.id));
    await prisma.knowledgeChunk.deleteMany({ where: { documentId: document.id } });
  }

  const pieces = chunkText(content);
  if (pieces.length === 0) return;

  const embedding = await embedTexts({ organizationId: document.organizationId, workspaceId: document.workspaceId, texts: pieces });

  const chunks = await prisma.$transaction(
    pieces.map((piece, index) =>
      prisma.knowledgeChunk.create({
        data: { documentId: document.id, chunkIndex: index, content: piece, embeddingModel: embedding.model },
      })
    )
  );

  await vectorStore.upsert(
    chunks.map((chunk, index) => ({
      id: chunk.id,
      vector: embedding.vectors[index],
      metadata: {
        documentId: document.id,
        organizationId: document.organizationId,
        workspaceId: document.workspaceId,
        chunkIndex: index,
        tags: document.tags,
      },
    }))
  );
}

export type IngestDocumentInput = {
  organizationId: string;
  workspaceId: string;
  sourceType: KnowledgeSourceType;
  sourceRef?: string;
  raw?: string;
  title?: string;
  tags?: string[];
  createdById?: string;
  priority?: number;
};

/**
 * Ajout ou mise à jour, selon qu'un document existe déjà pour
 * `(workspaceId, sourceType, sourceRef)`. Toujours ré-analyse la source
 * (un enregistrement CRM/devis/conversation peut avoir changé en base même
 * sans nouvel appel explicite), mais ignore la ré-vectorisation si
 * l'empreinte du contenu extrait n'a pas changé.
 */
export async function ingestDocument(input: IngestDocumentInput) {
  registerBuiltInDocumentParsers();
  const parser = getDocumentParser(input.sourceType);
  if (!parser) throw new ValidationError(`Aucun parseur enregistré pour la source "${input.sourceType}".`);

  const scope: Scope = { organizationId: input.organizationId, workspaceId: input.workspaceId };
  const existing = input.sourceRef
    ? await prisma.knowledgeDocument.findFirst({
        where: {
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          sourceType: input.sourceType,
          sourceRef: input.sourceRef,
        },
      })
    : null;

  const action = existing ? KnowledgeIndexAction.UPDATE : KnowledgeIndexAction.ADD;
  const start = Date.now();

  try {
    const parsed = await parser.parse({ raw: input.raw, sourceRef: input.sourceRef, title: input.title }, scope);
    const checksum = checksumOf(parsed.content);

    if (existing && existing.checksum === checksum) {
      await writeIndexLog({
        documentId: existing.id,
        workspaceId: input.workspaceId,
        action,
        priority: input.priority,
        success: true,
        message: "Aucun changement détecté, réindexation ignorée.",
        durationMs: Date.now() - start,
      });
      return existing;
    }

    const document = existing
      ? await prisma.knowledgeDocument.update({
          where: { id: existing.id },
          data: {
            title: parsed.title,
            content: parsed.content,
            metadata: parsed.metadata as never,
            tags: input.tags ?? existing.tags,
            checksum,
            status: KnowledgeDocumentStatus.INDEXED,
            errorMessage: null,
            indexedAt: new Date(),
            archivedAt: null,
          },
        })
      : await prisma.knowledgeDocument.create({
          data: {
            organizationId: input.organizationId,
            workspaceId: input.workspaceId,
            sourceType: input.sourceType,
            sourceRef: input.sourceRef,
            title: parsed.title,
            content: parsed.content,
            metadata: parsed.metadata as never,
            tags: input.tags ?? [],
            checksum,
            status: KnowledgeDocumentStatus.INDEXED,
            createdById: input.createdById,
            indexedAt: new Date(),
          },
        });

    await chunkAndEmbed(document, parsed.content);

    await writeIndexLog({
      documentId: document.id,
      workspaceId: input.workspaceId,
      action,
      priority: input.priority,
      success: true,
      durationMs: Date.now() - start,
    });
    return document;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failedDocument = existing
      ? await prisma.knowledgeDocument.update({
          where: { id: existing.id },
          data: { status: KnowledgeDocumentStatus.FAILED, errorMessage: message },
        })
      : await prisma.knowledgeDocument
          .create({
            data: {
              organizationId: input.organizationId,
              workspaceId: input.workspaceId,
              sourceType: input.sourceType,
              sourceRef: input.sourceRef,
              title: input.title ?? input.sourceRef ?? "(échec d'extraction)",
              tags: input.tags ?? [],
              status: KnowledgeDocumentStatus.FAILED,
              errorMessage: message,
              createdById: input.createdById,
            },
          })
          .catch(() => null);

    await writeIndexLog({
      documentId: failedDocument?.id,
      workspaceId: input.workspaceId,
      action,
      priority: input.priority,
      success: false,
      message,
      durationMs: Date.now() - start,
    });
    throw error;
  }
}

/** Suppression définitive : fragments retirés de la base vectorielle active puis de Postgres (cascade). L'entrée de journal survit (référence document mise à `null`). */
export async function deleteDocument(documentId: string, scope: Scope): Promise<void> {
  const document = await prisma.knowledgeDocument.findFirst({
    where: { id: documentId, organizationId: scope.organizationId, workspaceId: scope.workspaceId },
  });
  if (!document) throw new NotFoundError("Document introuvable.");

  const start = Date.now();
  const chunks = await prisma.knowledgeChunk.findMany({ where: { documentId }, select: { id: true } });
  if (chunks.length > 0) await getActiveVectorStore().delete(chunks.map((c) => c.id));

  await writeIndexLog({ documentId, workspaceId: scope.workspaceId, action: KnowledgeIndexAction.DELETE, success: true, durationMs: Date.now() - start });
  await prisma.knowledgeDocument.delete({ where: { id: documentId } });
}

/** Renommage : titre et/ou référence source, sans recalcul des fragments (le contenu extrait ne change pas). */
export async function renameDocument(
  documentId: string,
  scope: Scope,
  params: { newTitle?: string; newSourceRef?: string }
) {
  const document = await prisma.knowledgeDocument.findFirst({
    where: { id: documentId, organizationId: scope.organizationId, workspaceId: scope.workspaceId },
  });
  if (!document) throw new NotFoundError("Document introuvable.");

  const start = Date.now();
  const updated = await prisma.knowledgeDocument
    .update({
      where: { id: documentId },
      data: { title: params.newTitle ?? document.title, sourceRef: params.newSourceRef ?? document.sourceRef },
    })
    .catch(() => {
      throw new ValidationError("Un document avec cette référence existe déjà dans ce workspace.");
    });

  await writeIndexLog({ documentId, workspaceId: scope.workspaceId, action: KnowledgeIndexAction.RENAME, success: true, durationMs: Date.now() - start });
  return updated;
}

/**
 * Déplacement vers un autre workspace de la même organisation. Pour la
 * base vectorielle par défaut (`pgvector`, filtrage par jointure SQL en
 * temps réel), le déplacement est immédiatement cohérent. Pour une base
 * externe pilotée par métadonnées (Pinecone, Qdrant...), les métadonnées
 * `workspaceId` déjà indexées restent celles d'avant le déplacement
 * jusqu'à un `reindexDocument` — limite assumée, voir ADR 0025.
 */
export async function moveDocument(documentId: string, scope: Scope, newWorkspaceId: string) {
  const document = await prisma.knowledgeDocument.findFirst({
    where: { id: documentId, organizationId: scope.organizationId, workspaceId: scope.workspaceId },
  });
  if (!document) throw new NotFoundError("Document introuvable.");

  const targetWorkspace = await prisma.workspace.findFirst({ where: { id: newWorkspaceId, organizationId: scope.organizationId } });
  if (!targetWorkspace) throw new NotFoundError("Workspace de destination introuvable.");

  const start = Date.now();
  const updated = await prisma.knowledgeDocument.update({ where: { id: documentId }, data: { workspaceId: newWorkspaceId } });

  await writeIndexLog({ documentId, workspaceId: newWorkspaceId, action: KnowledgeIndexAction.MOVE, success: true, durationMs: Date.now() - start });
  return updated;
}

/** Réindexation complète d'un document à partir de son contenu déjà stocké (`KnowledgeDocument.content`) — utile après un changement de fournisseur/modèle d'embedding, indépendamment de tout changement de la source d'origine. */
export async function reindexDocument(documentId: string, scope: Scope, priority?: number): Promise<void> {
  const document = await prisma.knowledgeDocument.findFirst({
    where: { id: documentId, organizationId: scope.organizationId, workspaceId: scope.workspaceId },
  });
  if (!document) throw new NotFoundError("Document introuvable.");
  if (!document.content) throw new ValidationError("Ce document n'a pas de contenu indexable stocké.");

  const start = Date.now();
  try {
    await chunkAndEmbed(document, document.content);
    await prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: { status: KnowledgeDocumentStatus.INDEXED, errorMessage: null, indexedAt: new Date() },
    });
    await writeIndexLog({ documentId, workspaceId: scope.workspaceId, action: KnowledgeIndexAction.REINDEX, priority, success: true, durationMs: Date.now() - start });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.knowledgeDocument.update({ where: { id: documentId }, data: { status: KnowledgeDocumentStatus.FAILED, errorMessage: message } });
    await writeIndexLog({ documentId, workspaceId: scope.workspaceId, action: KnowledgeIndexAction.REINDEX, priority, success: false, message, durationMs: Date.now() - start });
    throw error;
  }
}

/**
 * Réindexation complète en lot de tous les documents non archivés d'un
 * périmètre organisation/workspace. Traitement séquentiel, délibérément
 * simple : cette phase de fondation privilégie la correction sur le débit
 * (pas de file d'attente/pool de workers) ; une future itération pourra
 * paralléliser par lots sans changer cette signature.
 */
export async function reindexAll(
  scope: { organizationId: string; workspaceId?: string },
  options?: { priority?: number }
): Promise<{ documentId: string; success: boolean; error?: string }[]> {
  const documents = await prisma.knowledgeDocument.findMany({
    where: { organizationId: scope.organizationId, workspaceId: scope.workspaceId, archivedAt: null },
    select: { id: true, workspaceId: true },
  });

  const results: { documentId: string; success: boolean; error?: string }[] = [];
  for (const doc of documents) {
    try {
      await reindexDocument(doc.id, { organizationId: scope.organizationId, workspaceId: doc.workspaceId }, options?.priority);
      results.push({ documentId: doc.id, success: true });
    } catch (error) {
      results.push({ documentId: doc.id, success: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}

/** Historique/journalisation consultable (réutilisé par le tableau de bord d'observabilité, voir tâche #51). */
export async function listIndexLogs(params: { workspaceId: string; documentId?: string; limit?: number }) {
  return prisma.knowledgeIndexLog.findMany({
    where: { workspaceId: params.workspaceId, documentId: params.documentId },
    orderBy: { createdAt: "desc" },
    take: params.limit ?? 50,
  });
}
