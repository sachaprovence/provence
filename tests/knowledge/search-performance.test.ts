import { afterAll, describe, expect, it } from "vitest";
import { KnowledgeSourceType } from "@/generated/prisma/enums";
import { ingestDocument } from "@/lib/knowledge/indexing-engine";
import { fulltextSearch, vectorSearch, hybridSearch } from "@/lib/knowledge/search";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

// Volume modeste (fondation, pas un test de charge) mais suffisant pour
// détecter une régression de complexité grossière (ex. un balayage complet
// devenu quadratique) — voir ADR 0025 sur la limite assumée de PgVectorStore.
const DOCUMENT_COUNT = 60;
const TIME_BUDGET_MS = 5000;

runIfDatabase("Performance de la recherche (benchmark de fondation)", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  it(`plein texte/vectorielle/hybride restent sous ${TIME_BUDGET_MS}ms avec ${DOCUMENT_COUNT} documents indexés`, async () => {
    const fixture = await createWorkflowTestFixture("search-perf");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    const scope = { organizationId: fixture.organization.id, workspaceId: fixture.workspace.id };

    for (let i = 0; i < DOCUMENT_COUNT; i += 1) {
      await ingestDocument({
        ...scope,
        sourceType: KnowledgeSourceType.NOTE,
        sourceRef: `perf-${i}`,
        raw: `Document ${i} : visite virtuelle 360 degrés pour un établissement hôtelier numéro ${i}. Détails variés sur l'offre et les tarifs.`,
      });
    }

    const fulltextStart = Date.now();
    const fulltextResults = await fulltextSearch("visite virtuelle hôtelier", scope, 10);
    const fulltextDuration = Date.now() - fulltextStart;

    const vectorStart = Date.now();
    const vectorResults = await vectorSearch("visite virtuelle hôtelier", scope, 10);
    const vectorDuration = Date.now() - vectorStart;

    const hybridStart = Date.now();
    const hybridResults = await hybridSearch("visite virtuelle hôtelier", scope, 10);
    const hybridDuration = Date.now() - hybridStart;

    expect(fulltextResults.length).toBeGreaterThan(0);
    expect(vectorResults.length).toBeGreaterThan(0);
    expect(hybridResults.length).toBeGreaterThan(0);

    expect(fulltextDuration).toBeLessThan(TIME_BUDGET_MS);
    expect(vectorDuration).toBeLessThan(TIME_BUDGET_MS);
    expect(hybridDuration).toBeLessThan(TIME_BUDGET_MS);
  }, 30_000);
});
