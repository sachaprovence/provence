import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  setMemoryEntry,
  getMemoryEntry,
  listMemoryEntries,
  getMemoryHistory,
  archiveMemoryEntry,
  clearExpiredMemoryEntries,
  purgeArchivedMemoryEntries,
  compressMemoryEntry,
} from "@/lib/memory/memory-engine";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Memory Engine", () => {
  const organizationIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  async function setupOrg(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org memory ${suffix}` } });
    organizationIds.push(organization.id);
    return organization;
  }

  it("crée une nouvelle version à chaque écriture et conserve l'historique", async () => {
    const org = await setupOrg("versioning");
    const ref = { scopeType: "AGENT" as const, scopeId: "agent-1", kind: "PREFERENCE" as const, key: "tone" };

    await setMemoryEntry({ organizationId: org.id, ...ref, value: { tone: "formel" } });
    await setMemoryEntry({ organizationId: org.id, ...ref, value: { tone: "amical" } });

    const current = await getMemoryEntry(org.id, ref);
    expect(current?.value).toEqual({ tone: "amical" });
    expect(current?.version).toBe(2);

    const history = await getMemoryHistory(org.id, ref);
    expect(history.length).toBe(2);
    expect(history.map((h) => h.isCurrent)).toEqual([true, false]);
  });

  it("respecte les différentes portées (utilisateur/organisation/workspace/agent/workflow/conversation/tâche)", async () => {
    const org = await setupOrg("scopes");
    const scopes = ["USER", "ORGANIZATION", "WORKSPACE", "AGENT", "WORKFLOW", "CONVERSATION", "TASK"] as const;
    for (const scopeType of scopes) {
      await setMemoryEntry({
        organizationId: org.id,
        scopeType,
        scopeId: `${scopeType}-1`,
        kind: "LONG_TERM",
        key: "note",
        value: { scopeType },
      });
    }
    for (const scopeType of scopes) {
      const entry = await getMemoryEntry(org.id, { scopeType, scopeId: `${scopeType}-1`, kind: "LONG_TERM", key: "note" });
      expect(entry?.value).toEqual({ scopeType });
    }
  });

  it("applique le TTL par défaut d'une mémoire TEMPORARY, sans TTL explicite fourni", async () => {
    const org = await setupOrg("ttl-default");
    const entry = await setMemoryEntry({
      organizationId: org.id,
      scopeType: "CONVERSATION",
      scopeId: "conv-1",
      kind: "TEMPORARY",
      key: "draft",
      value: { text: "brouillon" },
    });
    expect(entry.expiresAt).not.toBeNull();
    expect(entry.ttlMs).toBeGreaterThan(0);
  });

  it("une entrée expirée n'est plus renvoyée par getMemoryEntry, puis clearExpiredMemoryEntries l'archive", async () => {
    const org = await setupOrg("expiry");
    const ref = { scopeType: "TASK" as const, scopeId: "task-1", kind: "TEMPORARY" as const, key: "status" };
    const entry = await setMemoryEntry({ organizationId: org.id, ...ref, value: { done: false }, ttlMs: -1 });

    expect(await getMemoryEntry(org.id, ref)).toBeNull();

    const archivedCount = await clearExpiredMemoryEntries();
    expect(archivedCount).toBeGreaterThanOrEqual(1);

    const row = await prisma.memoryEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(row.archivedAt).not.toBeNull();
  });

  it("archivage manuel puis purge définitive après la période de rétention", async () => {
    const org = await setupOrg("archive-purge");
    const entry = await setMemoryEntry({
      organizationId: org.id,
      scopeType: "USER",
      scopeId: "user-1",
      kind: "DECISION",
      key: "onboarding",
      value: { approved: true },
    });
    await archiveMemoryEntry(entry.id);

    const listed = await listMemoryEntries({ organizationId: org.id, scopeType: "USER" });
    expect(listed.find((e) => e.id === entry.id)).toBeUndefined();

    const purged = await purgeArchivedMemoryEntries(-1);
    expect(purged).toBeGreaterThanOrEqual(1);
    expect(await prisma.memoryEntry.findUnique({ where: { id: entry.id } })).toBeNull();
  });

  it("compresse automatiquement une entrée volumineuse (résumé via le moteur LLM) et laisse une petite entrée inchangée", async () => {
    const org = await setupOrg("compress");
    const bigValue = { transcript: "x".repeat(3000) };
    const bigEntry = await setMemoryEntry({
      organizationId: org.id,
      scopeType: "CONVERSATION",
      scopeId: "conv-2",
      kind: "DOCUMENT",
      key: "transcript",
      value: bigValue,
    });
    const compressed = await compressMemoryEntry(bigEntry.id);
    expect(compressed.compressed).toBe(true);
    expect(compressed.summary).toBeTruthy();

    const smallEntry = await setMemoryEntry({
      organizationId: org.id,
      scopeType: "CONVERSATION",
      scopeId: "conv-2",
      kind: "DOCUMENT",
      key: "short-note",
      value: { note: "ok" },
    });
    const unchanged = await compressMemoryEntry(smallEntry.id);
    expect(unchanged.compressed).toBe(false);
  });
});
