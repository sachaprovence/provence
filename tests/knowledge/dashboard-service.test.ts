import { afterAll, describe, expect, it } from "vitest";
import { KnowledgeSourceType } from "@/generated/prisma/enums";
import { ingestDocument } from "@/lib/knowledge/indexing-engine";
import { searchKnowledge } from "@/lib/knowledge/search";
import { getKnowledgeDashboard } from "@/lib/knowledge/dashboard-service";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Knowledge Engine dashboard", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  it("agrège documents/chunks/index/embeddings/documents les plus utilisés", async () => {
    const fixture = await createWorkflowTestFixture("dashboard-knowledge");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    const scope = { organizationId: fixture.organization.id, workspaceId: fixture.workspace.id };

    await ingestDocument({
      ...scope,
      sourceType: KnowledgeSourceType.NOTE,
      sourceRef: "dash-1",
      raw: "Le studio propose des visites virtuelles 360 pour hôtels.",
    });
    await ingestDocument({
      ...scope,
      sourceType: KnowledgeSourceType.MARKDOWN,
      sourceRef: "dash-2",
      raw: "# Restaurant\n\nOffre dédiée aux restaurants.",
    });
    // Volontairement en échec (PDF non implémenté) pour peupler le compteur d'échecs.
    await ingestDocument({ ...scope, sourceType: KnowledgeSourceType.PDF, sourceRef: "broken.pdf", raw: "x" }).catch(() => {});

    await searchKnowledge("visites virtuelles hôtel", scope, { mode: "hybrid" });
    await searchKnowledge("visites virtuelles hôtel", scope, { mode: "hybrid" });

    const dashboard = await getKnowledgeDashboard(fixture.workspace.id);

    expect(dashboard.documents.total).toBeGreaterThanOrEqual(3);
    expect(dashboard.documents.byStatus.INDEXED).toBeGreaterThanOrEqual(2);
    expect(dashboard.documents.byStatus.FAILED).toBeGreaterThanOrEqual(1);
    expect(dashboard.chunks.total).toBeGreaterThan(0);
    expect(dashboard.indexing.totalOperations).toBeGreaterThan(0);
    expect(dashboard.indexing.totalFailures).toBeGreaterThanOrEqual(1);
    expect(dashboard.embeddings.totalRequests).toBeGreaterThan(0);
    expect(dashboard.mostUsedDocuments.length).toBeGreaterThan(0);
    expect(dashboard.mostUsedDocuments[0].usageCount).toBeGreaterThanOrEqual(2);
    expect(dashboard.responseQuality.available).toBe(false);
  });
});
