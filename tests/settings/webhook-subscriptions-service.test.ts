import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createWebhookSubscription, listWebhookSubscriptions, deleteWebhookSubscription } from "@/lib/settings/webhook-subscriptions-service";
import { NotFoundError, ValidationError } from "@/lib/errors";

/** Gestion des souscriptions webhook en self-service (v1.0, AR-0061). */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("createWebhookSubscription / listWebhookSubscriptions / deleteWebhookSubscription", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function setup(suffix: string) {
    const organization = await prisma.organization.create({ data: { name: `Org webhook ${suffix}` } });
    organizationIds.push(organization.id);
    const user = await prisma.user.create({
      data: { email: `webhook-${suffix}@example.test`, passwordHash: "not-a-real-hash", firstName: "Test", lastName: "Webhook" },
    });
    userIds.push(user.id);
    return { organization, user };
  }

  it("crée une souscription avec un secret généré automatiquement, jamais retrouvable ensuite", async () => {
    const { organization, user } = await setup("create");
    const { secret, preview } = await createWebhookSubscription({
      organizationId: organization.id,
      url: "https://example.test/hook",
      eventTypes: ["lead.created"],
      createdById: user.id,
    });

    expect(secret.length).toBeGreaterThanOrEqual(16);
    const stored = await prisma.webhookSubscription.findUniqueOrThrow({ where: { id: preview.id } });
    expect(stored.secret).toBe(secret);
    expect(JSON.stringify(preview)).not.toContain(secret);
  });

  it("rejette une URL invalide", async () => {
    const { organization, user } = await setup("bad-url");
    await expect(
      createWebhookSubscription({ organizationId: organization.id, url: "pas-une-url", eventTypes: ["lead.created"], createdById: user.id })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejette une liste d'évènements sans aucun type valide", async () => {
    const { organization, user } = await setup("bad-events");
    await expect(
      createWebhookSubscription({ organizationId: organization.id, url: "https://example.test/hook", eventTypes: ["not.a.real.event"], createdById: user.id })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("filtre silencieusement les types d'évènement invalides, en gardant les valides", async () => {
    const { organization, user } = await setup("mixed-events");
    const { preview } = await createWebhookSubscription({
      organizationId: organization.id,
      url: "https://example.test/hook",
      eventTypes: ["lead.created", "not.a.real.event"],
      createdById: user.id,
    });
    expect(preview.eventTypes).toEqual(["lead.created"]);
  });

  it("listWebhookSubscriptions isole strictement par organisation", async () => {
    const orgA = await setup("list-a");
    const orgB = await setup("list-b");
    const { preview } = await createWebhookSubscription({
      organizationId: orgA.organization.id,
      url: "https://example.test/a",
      eventTypes: ["lead.created"],
      createdById: orgA.user.id,
    });
    await createWebhookSubscription({
      organizationId: orgB.organization.id,
      url: "https://example.test/b",
      eventTypes: ["lead.created"],
      createdById: orgB.user.id,
    });

    const subscriptionsForA = await listWebhookSubscriptions(orgA.organization.id);
    expect(subscriptionsForA.map((s) => s.id)).toEqual([preview.id]);
  });

  it("deleteWebhookSubscription échoue explicitement pour une souscription d'une autre organisation", async () => {
    const orgA = await setup("delete-a");
    const orgB = await setup("delete-b");
    const { preview } = await createWebhookSubscription({
      organizationId: orgA.organization.id,
      url: "https://example.test/hook",
      eventTypes: ["lead.created"],
      createdById: orgA.user.id,
    });

    await expect(deleteWebhookSubscription(orgB.organization.id, preview.id)).rejects.toBeInstanceOf(NotFoundError);

    await deleteWebhookSubscription(orgA.organization.id, preview.id);
    expect(await prisma.webhookSubscription.findUnique({ where: { id: preview.id } })).toBeNull();
  });
});
