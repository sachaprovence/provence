import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { PostgresQueueProvider } from "@/lib/automation/queue/providers/postgres-queue";
import { MemoryQueueProvider } from "@/lib/automation/queue/providers/memory-queue";
import { registerBuiltInQueueProviders, getActiveQueueProvider } from "@/lib/automation/queue";
import { listRegisteredQueueProviderKeys } from "@/lib/automation/queue/registry";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Queue Manager", () => {
  const organizationIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  async function setupOrgWorkspace(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org queue ${suffix}` } });
    organizationIds.push(organization.id);
    const workspace = await prisma.workspace.create({
      data: { organizationId: organization.id, name: `WS ${suffix}`, slug: "principal" },
    });
    return { organization, workspace };
  }

  it("enregistre les 7 fournisseurs anticipés (2 réels + 5 stubs honnêtes)", () => {
    registerBuiltInQueueProviders();
    expect(listRegisteredQueueProviderKeys().sort()).toEqual(
      ["postgres", "memory", "bullmq", "redis", "rabbitmq", "sqs", "kafka"].sort()
    );
  });

  it("les fournisseurs non implémentés échouent explicitement, jamais un faux succès", async () => {
    registerBuiltInQueueProviders();
    const provider = getActiveQueueProvider();
    expect(provider.key).toBe("postgres");
    const { getQueueProvider } = await import("@/lib/automation/queue/registry");
    const bullmq = getQueueProvider("bullmq")!;
    await expect(bullmq.claim({ limit: 1, workerId: "w1" })).rejects.toThrow(/n'est pas encore développée/);
  });

  it("PostgresQueueProvider réclame par priorité décroissante puis scheduledAt croissant, jamais deux fois le même job", async () => {
    const { organization, workspace } = await setupOrgWorkspace("pg-claim");
    // jobTypes distinctifs : le Queue Manager Postgres est volontairement système-large
    // (pas scopé par tenant, voir ADR 0032) — des jobTypes uniques isolent ce test des
    // autres fichiers de test qui s'exécutent en parallèle sur la même base.
    const echoType = `test.echo.${Date.now()}`;
    const otherType = `test.other.${Date.now()}`;
    const low = await prisma.automationJob.create({
      data: { organizationId: organization.id, workspaceId: workspace.id, jobType: echoType, priority: 1 },
    });
    const high = await prisma.automationJob.create({
      data: { organizationId: organization.id, workspaceId: workspace.id, jobType: echoType, priority: 5 },
    });
    const other = await prisma.automationJob.create({
      data: { organizationId: organization.id, workspaceId: workspace.id, jobType: otherType, priority: 0 },
    });

    const queue = new PostgresQueueProvider();
    const firstBatch = await queue.claim({ limit: 2, workerId: "worker-1", jobTypes: [echoType, otherType] });
    expect(firstBatch.map((j) => j.id)).toEqual([high.id, low.id]);

    const filtered = await queue.claim({ limit: 5, workerId: "worker-1", jobTypes: [otherType] });
    expect(filtered.map((j) => j.id)).toEqual([other.id]);

    const nothingLeft = await queue.claim({ limit: 5, workerId: "worker-1", jobTypes: [echoType, otherType] });
    expect(nothingLeft).toEqual([]);

    const rows = await prisma.automationJob.findMany({ where: { id: { in: [low.id, high.id, other.id] } } });
    expect(rows.every((r) => r.status === "CLAIMED" && r.claimedBy === "worker-1")).toBe(true);
  });

  it("deux réclamations concurrentes ne réclament jamais le même job (FOR UPDATE SKIP LOCKED)", async () => {
    const { organization, workspace } = await setupOrgWorkspace("pg-concurrent");
    // jobType distinctif : le Queue Manager Postgres est volontairement système-large
    // (pas scopé par tenant, voir ADR 0032) — un jobType unique isole ce test des
    // autres fichiers de test qui s'exécutent en parallèle sur la même base.
    const jobType = `test.echo.concurrent.${Date.now()}`;
    await prisma.automationJob.createMany({
      data: Array.from({ length: 10 }, () => ({ organizationId: organization.id, workspaceId: workspace.id, jobType })),
    });

    const queue = new PostgresQueueProvider();
    const [batchA, batchB] = await Promise.all([
      queue.claim({ limit: 6, workerId: "worker-A", jobTypes: [jobType] }),
      queue.claim({ limit: 6, workerId: "worker-B", jobTypes: [jobType] }),
    ]);

    const idsA = new Set(batchA.map((j) => j.id));
    const idsB = new Set(batchB.map((j) => j.id));
    const overlap = [...idsA].filter((id) => idsB.has(id));
    expect(overlap).toEqual([]);
    expect(batchA.length + batchB.length).toBe(10);
  });

  it("respecte toujours `limit` sous forte charge concurrente (plusieurs workers, plusieurs lots)", async () => {
    const { organization, workspace } = await setupOrgWorkspace("pg-stress");
    const jobType = `test.echo.stress.${Date.now()}`;
    const TOTAL_JOBS = 40;
    const WORKERS = 8;
    const LIMIT_PER_CLAIM = 3;

    await prisma.automationJob.createMany({
      data: Array.from({ length: TOTAL_JOBS }, () => ({ organizationId: organization.id, workspaceId: workspace.id, jobType })),
    });

    const queue = new PostgresQueueProvider();
    const batches = await Promise.all(
      Array.from({ length: WORKERS }, (_, i) => queue.claim({ limit: LIMIT_PER_CLAIM, workerId: `stress-worker-${i}`, jobTypes: [jobType] }))
    );

    for (const batch of batches) {
      expect(batch.length).toBeLessThanOrEqual(LIMIT_PER_CLAIM);
    }

    const allClaimedIds = batches.flat().map((j) => j.id);
    expect(new Set(allClaimedIds).size).toBe(allClaimedIds.length); // jamais deux fois le même job
    expect(allClaimedIds.length).toBe(Math.min(TOTAL_JOBS, WORKERS * LIMIT_PER_CLAIM));
  });

  it("MemoryQueueProvider réclame par priorité et n'est jamais visible d'un autre worker après réclamation", async () => {
    const { organization, workspace } = await setupOrgWorkspace("memory-claim");
    const low = await prisma.automationJob.create({
      data: { organizationId: organization.id, workspaceId: workspace.id, jobType: "test.echo", priority: 1 },
    });
    const high = await prisma.automationJob.create({
      data: { organizationId: organization.id, workspaceId: workspace.id, jobType: "test.echo", priority: 9 },
    });

    const queue = new MemoryQueueProvider();
    await queue.notify({ id: low.id, jobType: "test.echo", priority: 1 });
    await queue.notify({ id: high.id, jobType: "test.echo", priority: 9 });

    const claimed = await queue.claim({ limit: 5, workerId: "worker-1" });
    expect(claimed.map((j) => j.id)).toEqual([high.id, low.id]);

    const again = await queue.claim({ limit: 5, workerId: "worker-1" });
    expect(again).toEqual([]);
  });
});
