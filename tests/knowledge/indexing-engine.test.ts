import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { KnowledgeSourceType } from "@/generated/prisma/enums";
import {
  ingestDocument,
  deleteDocument,
  renameDocument,
  moveDocument,
  reindexDocument,
  reindexAll,
  listIndexLogs,
} from "@/lib/knowledge/indexing-engine";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Indexing engine", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  it("ajout : crée le document, ses fragments et une entrée de journal ADD", async () => {
    const fixture = await createWorkflowTestFixture("index-add");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const document = await ingestDocument({
      organizationId: fixture.organization.id,
      workspaceId: fixture.workspace.id,
      sourceType: KnowledgeSourceType.MARKDOWN,
      sourceRef: "doc-1",
      raw: "# Titre\n\nPremier contenu suffisamment long pour être indexé.",
    });

    const chunks = await prisma.knowledgeChunk.findMany({ where: { documentId: document.id } });
    expect(chunks.length).toBeGreaterThan(0);

    const logs = await listIndexLogs({ workspaceId: fixture.workspace.id, documentId: document.id });
    expect(logs[0].action).toBe("ADD");
    expect(logs[0].success).toBe(true);
  });

  it("détection automatique des changements : un ré-ingestion du même contenu est ignorée (pas de nouveaux fragments)", async () => {
    const fixture = await createWorkflowTestFixture("index-unchanged");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const raw = "# Stable\n\nContenu qui ne va pas changer.";
    const first = await ingestDocument({
      organizationId: fixture.organization.id,
      workspaceId: fixture.workspace.id,
      sourceType: KnowledgeSourceType.MARKDOWN,
      sourceRef: "doc-2",
      raw,
    });
    const chunksBefore = await prisma.knowledgeChunk.findMany({ where: { documentId: first.id } });

    const second = await ingestDocument({
      organizationId: fixture.organization.id,
      workspaceId: fixture.workspace.id,
      sourceType: KnowledgeSourceType.MARKDOWN,
      sourceRef: "doc-2",
      raw,
    });
    const chunksAfter = await prisma.knowledgeChunk.findMany({ where: { documentId: first.id } });

    expect(second.id).toBe(first.id);
    expect(chunksAfter.length).toBe(chunksBefore.length);

    const logs = await listIndexLogs({ workspaceId: fixture.workspace.id, documentId: first.id });
    expect(logs[0].message).toMatch(/ignorée/);
  });

  it("mise à jour : un contenu modifié déclenche une action UPDATE et remplace les fragments", async () => {
    const fixture = await createWorkflowTestFixture("index-update");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const first = await ingestDocument({
      organizationId: fixture.organization.id,
      workspaceId: fixture.workspace.id,
      sourceType: KnowledgeSourceType.MARKDOWN,
      sourceRef: "doc-3",
      raw: "# V1\n\nContenu initial.",
    });

    const updated = await ingestDocument({
      organizationId: fixture.organization.id,
      workspaceId: fixture.workspace.id,
      sourceType: KnowledgeSourceType.MARKDOWN,
      sourceRef: "doc-3",
      raw: "# V2\n\nContenu bien différent, plus long et modifié pour changer l'empreinte.",
    });

    expect(updated.id).toBe(first.id);
    expect(updated.content).toMatch(/V2/);

    const logs = await listIndexLogs({ workspaceId: fixture.workspace.id, documentId: first.id });
    expect(logs[0].action).toBe("UPDATE");
  });

  it("suppression : retire le document et ses fragments, conserve le journal", async () => {
    const fixture = await createWorkflowTestFixture("index-delete");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const document = await ingestDocument({
      organizationId: fixture.organization.id,
      workspaceId: fixture.workspace.id,
      sourceType: KnowledgeSourceType.NOTE,
      sourceRef: "note-1",
      raw: "Une note à supprimer.",
    });

    await deleteDocument(document.id, { organizationId: fixture.organization.id, workspaceId: fixture.workspace.id });

    const found = await prisma.knowledgeDocument.findUnique({ where: { id: document.id } });
    expect(found).toBeNull();
    const remainingChunks = await prisma.knowledgeChunk.findMany({ where: { documentId: document.id } });
    expect(remainingChunks.length).toBe(0);

    const logs = await prisma.knowledgeIndexLog.findMany({ where: { workspaceId: fixture.workspace.id, action: "DELETE" } });
    expect(logs.length).toBe(1);
    expect(logs[0].documentId).toBeNull();
  });

  it("renommage : change le titre sans toucher aux fragments", async () => {
    const fixture = await createWorkflowTestFixture("index-rename");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const document = await ingestDocument({
      organizationId: fixture.organization.id,
      workspaceId: fixture.workspace.id,
      sourceType: KnowledgeSourceType.NOTE,
      sourceRef: "note-2",
      raw: "Contenu à ne pas changer.",
    });
    const chunksBefore = await prisma.knowledgeChunk.findMany({ where: { documentId: document.id } });

    const renamed = await renameDocument(
      document.id,
      { organizationId: fixture.organization.id, workspaceId: fixture.workspace.id },
      { newTitle: "Nouveau titre" }
    );
    const chunksAfter = await prisma.knowledgeChunk.findMany({ where: { documentId: document.id } });

    expect(renamed.title).toBe("Nouveau titre");
    expect(chunksAfter.length).toBe(chunksBefore.length);
  });

  it("déplacement : change le workspace du document, refuse un workspace d'une autre organisation", async () => {
    const fixture = await createWorkflowTestFixture("index-move");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    const otherFixture = await createWorkflowTestFixture("index-move-other-org");
    organizationIds.push(otherFixture.organization.id);
    userIds.push(otherFixture.user.id);

    const secondWorkspace = await prisma.workspace.create({
      data: { organizationId: fixture.organization.id, name: "Second workspace", slug: "second" },
    });

    const document = await ingestDocument({
      organizationId: fixture.organization.id,
      workspaceId: fixture.workspace.id,
      sourceType: KnowledgeSourceType.NOTE,
      sourceRef: "note-3",
      raw: "Contenu déplaçable.",
    });

    const moved = await moveDocument(
      document.id,
      { organizationId: fixture.organization.id, workspaceId: fixture.workspace.id },
      secondWorkspace.id
    );
    expect(moved.workspaceId).toBe(secondWorkspace.id);

    await expect(
      moveDocument(document.id, { organizationId: fixture.organization.id, workspaceId: secondWorkspace.id }, otherFixture.workspace.id)
    ).rejects.toThrow(/introuvable/);
  });

  it("réindexation : recalcule les fragments à partir du contenu déjà stocké, sans re-parser la source", async () => {
    const fixture = await createWorkflowTestFixture("index-reindex");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    const document = await ingestDocument({
      organizationId: fixture.organization.id,
      workspaceId: fixture.workspace.id,
      sourceType: KnowledgeSourceType.NOTE,
      sourceRef: "note-4",
      raw: "Contenu à réindexer.",
    });
    const chunksBefore = await prisma.knowledgeChunk.findMany({ where: { documentId: document.id } });

    await reindexDocument(document.id, { organizationId: fixture.organization.id, workspaceId: fixture.workspace.id });
    const chunksAfter = await prisma.knowledgeChunk.findMany({ where: { documentId: document.id } });

    expect(chunksAfter.length).toBe(chunksBefore.length);
    expect(chunksAfter[0].content).toBe(chunksBefore[0].content);

    const logs = await prisma.knowledgeIndexLog.findMany({ where: { workspaceId: fixture.workspace.id, action: "REINDEX" } });
    expect(logs.length).toBe(1);
  });

  it("réindexation complète en lot : traite tous les documents non archivés du périmètre", async () => {
    const fixture = await createWorkflowTestFixture("index-reindex-all");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    await ingestDocument({
      organizationId: fixture.organization.id,
      workspaceId: fixture.workspace.id,
      sourceType: KnowledgeSourceType.NOTE,
      sourceRef: "batch-1",
      raw: "Premier document du lot.",
    });
    await ingestDocument({
      organizationId: fixture.organization.id,
      workspaceId: fixture.workspace.id,
      sourceType: KnowledgeSourceType.NOTE,
      sourceRef: "batch-2",
      raw: "Second document du lot.",
    });

    const results = await reindexAll({ organizationId: fixture.organization.id, workspaceId: fixture.workspace.id });
    expect(results.length).toBe(2);
    expect(results.every((r) => r.success)).toBe(true);
  });

  it("échec de parsing : journalise un échec explicite sans jamais créer un succès factice", async () => {
    const fixture = await createWorkflowTestFixture("index-fail");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);

    await expect(
      ingestDocument({
        organizationId: fixture.organization.id,
        workspaceId: fixture.workspace.id,
        sourceType: KnowledgeSourceType.PDF,
        sourceRef: "broken.pdf",
        raw: "peu importe",
      })
    ).rejects.toThrow(/n'est pas encore développée/);

    const logs = await prisma.knowledgeIndexLog.findMany({ where: { workspaceId: fixture.workspace.id, success: false } });
    expect(logs.length).toBe(1);
  });
});
