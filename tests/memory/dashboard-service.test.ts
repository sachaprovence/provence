import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { setMemoryEntry, archiveMemoryEntry } from "@/lib/memory/memory-engine";
import { getMemoryDashboard } from "@/lib/memory/dashboard-service";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Memory Engine dashboard", () => {
  const organizationIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  it("agrège les entrées par niveau, par nature, et compte archivage/nettoyage en attente", async () => {
    const organization = await prisma.organization.create({ data: { name: "Org memory dashboard" } });
    organizationIds.push(organization.id);

    await setMemoryEntry({
      organizationId: organization.id,
      scopeType: "USER",
      scopeId: "user-1",
      kind: "PREFERENCE",
      key: "tone",
      value: { tone: "formel" },
    });
    await setMemoryEntry({
      organizationId: organization.id,
      scopeType: "ORGANIZATION",
      scopeId: organization.id,
      kind: "DECISION",
      key: "pricing",
      value: { decision: "ok" },
    });
    const toArchive = await setMemoryEntry({
      organizationId: organization.id,
      scopeType: "TASK",
      scopeId: "task-1",
      kind: "LONG_TERM",
      key: "old",
      value: { done: true },
    });
    await archiveMemoryEntry(toArchive.id);
    await setMemoryEntry({
      organizationId: organization.id,
      scopeType: "CONVERSATION",
      scopeId: "conv-1",
      kind: "TEMPORARY",
      key: "expired",
      value: { text: "x" },
      ttlMs: -1,
    });

    const dashboard = await getMemoryDashboard(organization.id);

    expect(dashboard.totalCurrentEntries).toBeGreaterThanOrEqual(3);
    expect(dashboard.byScopeType.USER).toBeGreaterThanOrEqual(1);
    expect(dashboard.byScopeType.ORGANIZATION).toBeGreaterThanOrEqual(1);
    expect(dashboard.byKind.PREFERENCE).toBeGreaterThanOrEqual(1);
    expect(dashboard.byKind.DECISION).toBeGreaterThanOrEqual(1);
    expect(dashboard.archivedCount).toBeGreaterThanOrEqual(1);
    expect(dashboard.pendingCleanupCount).toBeGreaterThanOrEqual(1);
  });
});
