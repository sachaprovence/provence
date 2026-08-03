import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { sendToDeadLetter, listDeadLetters, replayDeadLetter } from "@/lib/automation/dlq";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Dead Letter Queue", () => {
  const organizationIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  async function setupOrgWorkspace(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org dlq ${suffix}` } });
    organizationIds.push(organization.id);
    const workspace = await prisma.workspace.create({
      data: { organizationId: organization.id, name: `WS ${suffix}`, slug: "principal" },
    });
    return { organization, workspace };
  }

  it("envoie un job en DLQ puis le liste, scopé par organisation/workspace", async () => {
    const { organization, workspace } = await setupOrgWorkspace("dlq-list");
    const job = await prisma.automationJob.create({
      data: { organizationId: organization.id, workspaceId: workspace.id, jobType: "test.echo" },
    });

    await sendToDeadLetter(job.id, "épuisement des tentatives");

    const deadLetters = await listDeadLetters({ organizationId: organization.id, workspaceId: workspace.id });
    expect(deadLetters.map((j) => j.id)).toContain(job.id);
    expect(deadLetters[0].error).toEqual({ message: "épuisement des tentatives" });
  });

  it("rejoue un job de la DLQ : remis en QUEUED, tentative réinitialisée", async () => {
    const { organization, workspace } = await setupOrgWorkspace("dlq-replay");
    const job = await prisma.automationJob.create({
      data: { organizationId: organization.id, workspaceId: workspace.id, jobType: "test.echo", attempt: 4 },
    });
    await sendToDeadLetter(job.id, "erreur définitive");

    const replayed = await replayDeadLetter(job.id, { organizationId: organization.id, workspaceId: workspace.id });
    expect(replayed.status).toBe("QUEUED");
    expect(replayed.attempt).toBe(0);
    expect(replayed.error).toBeNull();
  });

  it("refuse de rejouer un job qui n'est pas dans la DLQ", async () => {
    const { organization, workspace } = await setupOrgWorkspace("dlq-not-dead");
    const job = await prisma.automationJob.create({
      data: { organizationId: organization.id, workspaceId: workspace.id, jobType: "test.echo" },
    });
    await expect(replayDeadLetter(job.id, { organizationId: organization.id, workspaceId: workspace.id })).rejects.toThrow(ValidationError);
  });

  it("isolation multi-tenant : un job de la DLQ d'une autre organisation est introuvable", async () => {
    const { organization: orgA, workspace: wsA } = await setupOrgWorkspace("dlq-tenant-a");
    const { organization: orgB, workspace: wsB } = await setupOrgWorkspace("dlq-tenant-b");
    const job = await prisma.automationJob.create({
      data: { organizationId: orgA.id, workspaceId: wsA.id, jobType: "test.echo" },
    });
    await sendToDeadLetter(job.id, "erreur");

    await expect(replayDeadLetter(job.id, { organizationId: orgB.id, workspaceId: wsB.id })).rejects.toThrow(NotFoundError);
  });
});
