import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { admitByConcurrency, remainingGlobalCapacity } from "@/lib/automation/concurrency/concurrency-manager";
import { RateLimiter } from "@/lib/automation/concurrency/rate-limiter";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describe("RateLimiter (token bucket)", () => {
  it("autorise jusqu'à la capacité puis refuse, sans limite configurée = toujours autorisé", () => {
    const limiter = new RateLimiter();
    expect(limiter.tryConsume("unconfigured")).toBe(true);

    limiter.configure("api-x", 2, 60_000);
    expect(limiter.tryConsume("api-x")).toBe(true);
    expect(limiter.tryConsume("api-x")).toBe(true);
    expect(limiter.tryConsume("api-x")).toBe(false);
  });
});

runIfDatabase("Concurrency Manager", () => {
  const organizationIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  async function setupOrgWorkspace(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org concurrency ${suffix}` } });
    organizationIds.push(organization.id);
    const workspace = await prisma.workspace.create({
      data: { organizationId: organization.id, name: `WS ${suffix}`, slug: "principal" },
    });
    return { organization, workspace };
  }

  it("diffère un job dont la concurrencyKey a déjà atteint sa limite (jobs déjà RUNNING en base)", async () => {
    const { organization, workspace } = await setupOrgWorkspace("limit-running");
    await prisma.automationJob.create({
      data: {
        organizationId: organization.id,
        workspaceId: workspace.id,
        jobType: "test.echo",
        status: "RUNNING",
        concurrencyKey: "prospect:42",
      },
    });

    const candidate = { id: "candidate-1", concurrencyKey: "prospect:42", concurrencyLimit: 1, rateLimitKey: null };
    const { admitted, deferred } = await admitByConcurrency([candidate]);
    expect(admitted).toEqual([]);
    expect(deferred).toEqual(["candidate-1"]);
  });

  it("n'admet jamais plus que concurrencyLimit au sein du même lot", async () => {
    const candidates = [
      { id: "a", concurrencyKey: "shared", concurrencyLimit: 2, rateLimitKey: null },
      { id: "b", concurrencyKey: "shared", concurrencyLimit: 2, rateLimitKey: null },
      { id: "c", concurrencyKey: "shared", concurrencyLimit: 2, rateLimitKey: null },
    ];
    const { admitted, deferred } = await admitByConcurrency(candidates);
    expect(admitted).toEqual(["a", "b"]);
    expect(deferred).toEqual(["c"]);
  });

  it("sans concurrencyKey/concurrencyLimit, toujours admis", async () => {
    const { admitted } = await admitByConcurrency([{ id: "free", concurrencyKey: null, concurrencyLimit: null, rateLimitKey: null }]);
    expect(admitted).toEqual(["free"]);
  });

  it("remainingGlobalCapacity : null si aucune limite configurée", async () => {
    const previous = process.env.AUTOMATION_MAX_CONCURRENT_JOBS;
    delete process.env.AUTOMATION_MAX_CONCURRENT_JOBS;
    expect(await remainingGlobalCapacity()).toBeNull();
    if (previous !== undefined) process.env.AUTOMATION_MAX_CONCURRENT_JOBS = previous;
  });

  it("remainingGlobalCapacity : reflète le nombre de jobs RUNNING quand une limite est configurée", async () => {
    const { organization, workspace } = await setupOrgWorkspace("global-cap");
    await prisma.automationJob.create({
      data: { organizationId: organization.id, workspaceId: workspace.id, jobType: "test.echo", status: "RUNNING" },
    });

    const previous = process.env.AUTOMATION_MAX_CONCURRENT_JOBS;
    process.env.AUTOMATION_MAX_CONCURRENT_JOBS = "1000000";
    try {
      const remaining = await remainingGlobalCapacity();
      expect(remaining).toBeGreaterThanOrEqual(1);
      expect(remaining).toBeLessThan(1000000);
    } finally {
      if (previous === undefined) delete process.env.AUTOMATION_MAX_CONCURRENT_JOBS;
      else process.env.AUTOMATION_MAX_CONCURRENT_JOBS = previous;
    }
  });
});
