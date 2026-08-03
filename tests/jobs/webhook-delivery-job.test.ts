import crypto from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { processDueWebhookDeliveries } from "@/lib/jobs/webhook-delivery-job";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";

/**
 * Traitement des livraisons de webhooks sortants (v1.0, AR-0061) — vérifie
 * la signature HMAC envoyée au récepteur, la progression réelle vers
 * SUCCESS/retry planifié/FAILED définitif (réutilise la politique de
 * retry exponentielle déjà existante de l'Automation Engine), et
 * l'idempotence (en-tête `X-Autorun-Delivery-Id`).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("processDueWebhookDeliveries", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function createSubscriptionWithDelivery(params: { attempts?: number; createdAt?: Date; secret?: string }) {
    const fixture = await createWorkflowTestFixture(`webhook-delivery-${crypto.randomUUID()}`);
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    const subscription = await prisma.webhookSubscription.create({
      data: {
        organizationId: fixture.organization.id,
        // URL unique par test — `processDueWebhookDeliveries()` scanne toutes
        // les livraisons dues, tous tests confondus (exécutés en parallèle
        // contre la même base) ; une URL partagée empêcherait de distinguer
        // de façon fiable les appels fetch de CE test de ceux d'un autre.
        url: `https://example.test/receiver/${crypto.randomUUID()}`,
        secret: params.secret ?? "test-hmac-secret",
        eventTypes: ["lead.created"],
      },
    });
    const delivery = await prisma.webhookDelivery.create({
      data: {
        subscriptionId: subscription.id,
        organizationId: fixture.organization.id,
        eventType: "lead.created",
        payload: { leadId: "lead-1" },
        idempotencyKey: crypto.randomUUID(),
        attempts: params.attempts ?? 0,
        createdAt: params.createdAt ?? new Date(),
      },
    });
    return { fixture, subscription, delivery };
  }

  it("marque SUCCESS et envoie une signature HMAC correcte au récepteur", async () => {
    const { subscription, delivery } = await createSubscriptionWithDelivery({ secret: "known-secret" });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

    const result = await processDueWebhookDeliveries();

    expect(result.succeeded).toBeGreaterThanOrEqual(1);
    const updated = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(updated.status).toBe("SUCCESS");
    expect(updated.deliveredAt).not.toBeNull();

    expect(fetchMock).toHaveBeenCalledWith(
      subscription.url,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-Autorun-Delivery-Id": delivery.idempotencyKey,
          "X-Autorun-Event": "lead.created",
        }),
      })
    );

    // `processDueWebhookDeliveries()` scanne TOUTES les livraisons dues, tous
    // tests confondus (exécutés en parallèle contre la même base) — ne
    // jamais supposer que l'appel de CE test est `calls[0]`, retrouver
    // l'appel qui porte son propre en-tête d'idempotence.
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const call = calls.find(([, options]) => (options.headers as Record<string, string>)["X-Autorun-Delivery-Id"] === delivery.idempotencyKey);
    const [, options] = call!;
    const headers = options.headers as Record<string, string>;
    const expectedSignature = crypto.createHmac("sha256", "known-secret").update(`${delivery.idempotencyKey}.${options.body}`).digest("hex");
    expect(headers["X-Autorun-Signature"]).toBe(expectedSignature);
  });

  it("planifie une nouvelle tentative après un échec, sans marquer FAILED avant d'avoir atteint le nombre maximal", async () => {
    const { delivery } = await createSubscriptionWithDelivery({});
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));

    await processDueWebhookDeliveries();

    const updated = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(updated.status).toBe("PENDING");
    expect(updated.attempts).toBe(1);
    expect(updated.nextRetryAt).not.toBeNull();
    expect(updated.nextRetryAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("marque FAILED définitivement après le nombre maximal de tentatives (politique par défaut : 5)", async () => {
    const { delivery } = await createSubscriptionWithDelivery({ attempts: 4 });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));

    await processDueWebhookDeliveries();

    const updated = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(updated.status).toBe("FAILED");
    expect(updated.attempts).toBe(5);
  });

  it("ne retraite jamais une livraison dont la nouvelle tentative n'est pas encore due", async () => {
    const { subscription, delivery } = await createSubscriptionWithDelivery({});
    await prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { nextRetryAt: new Date(Date.now() + 60_000) } });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

    await processDueWebhookDeliveries();

    // `processDueWebhookDeliveries()` scanne toutes les livraisons dues, tous
    // tests confondus (exécutés en parallèle contre la même base) — vérifier
    // que fetch n'a jamais été appelé pour CETTE souscription, pas que le
    // mock global n'a jamais été appelé du tout.
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(calls.some(([url]) => url === subscription.url)).toBe(false);
    const unchanged = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(unchanged.status).toBe("PENDING");
    expect(unchanged.attempts).toBe(0);
  });

  it("gère une erreur réseau (fetch qui rejette) sans planter, en planifiant une nouvelle tentative", async () => {
    const { delivery } = await createSubscriptionWithDelivery({});
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    await processDueWebhookDeliveries();

    const updated = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(updated.status).toBe("PENDING");
    expect(updated.lastError).toContain("ECONNREFUSED");
  });
});
