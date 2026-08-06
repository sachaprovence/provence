import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { ValidationError, NotFoundError } from "@/lib/errors";
import {
  connectWebhookIntegration,
  disconnectWebhookIntegration,
  testWebhookIntegration,
  getUnifiedConnectorsView,
} from "@/lib/integrations/connectors-service";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";

/**
 * Écran Connecteurs unifié (v1.6-5) : connexion/déconnexion/test des
 * connecteurs webhook (Slack/Discord), vue consolidée, et isolation
 * multi-tenant.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("connectors-service (v1.6)", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("connectWebhookIntegration", () => {
    it("crée un connecteur SLACK avec le statut CONNECTED", async () => {
      const fixture = await createWorkflowTestFixture("connector-slack-create");
      organizationIds.push(fixture.organization.id);
      userIds.push(fixture.user.id);

      const integration = await connectWebhookIntegration(fixture.actor, "SLACK", "https://hooks.slack.com/services/T/B/X");
      expect(integration.status).toBe("CONNECTED");
      expect((integration.config as { webhookUrl: string }).webhookUrl).toBe("https://hooks.slack.com/services/T/B/X");
    });

    it("rejette une URL non-https", async () => {
      const fixture = await createWorkflowTestFixture("connector-invalid-url");
      organizationIds.push(fixture.organization.id);
      userIds.push(fixture.user.id);

      await expect(connectWebhookIntegration(fixture.actor, "SLACK", "http://insecure.example")).rejects.toThrow(ValidationError);
    });

    it("réutilise la même ligne Integration si on reconnecte (jamais de doublon)", async () => {
      const fixture = await createWorkflowTestFixture("connector-reconnect");
      organizationIds.push(fixture.organization.id);
      userIds.push(fixture.user.id);

      const first = await connectWebhookIntegration(fixture.actor, "DISCORD", "https://discord.com/api/webhooks/1/aaa");
      const second = await connectWebhookIntegration(fixture.actor, "DISCORD", "https://discord.com/api/webhooks/1/bbb");
      expect(second.id).toBe(first.id);

      const count = await prisma.integration.count({ where: { organizationId: fixture.organization.id, kind: "DISCORD" } });
      expect(count).toBe(1);
    });
  });

  describe("disconnectWebhookIntegration", () => {
    it("passe le statut à DISCONNECTED et vide la config", async () => {
      const fixture = await createWorkflowTestFixture("connector-disconnect");
      organizationIds.push(fixture.organization.id);
      userIds.push(fixture.user.id);

      await connectWebhookIntegration(fixture.actor, "SLACK", "https://hooks.slack.com/services/T/B/X");
      const disconnected = await disconnectWebhookIntegration(fixture.actor, "SLACK");
      expect(disconnected.status).toBe("DISCONNECTED");
      expect(disconnected.config).toEqual({});
    });

    it("lève NotFoundError si le connecteur n'a jamais été configuré", async () => {
      const fixture = await createWorkflowTestFixture("connector-disconnect-missing");
      organizationIds.push(fixture.organization.id);
      userIds.push(fixture.user.id);

      await expect(disconnectWebhookIntegration(fixture.actor, "SLACK")).rejects.toThrow(NotFoundError);
    });
  });

  describe("testWebhookIntegration", () => {
    it("marque CONNECTED sur une réponse 2xx réelle", async () => {
      const fixture = await createWorkflowTestFixture("connector-test-success");
      organizationIds.push(fixture.organization.id);
      userIds.push(fixture.user.id);

      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));
      await connectWebhookIntegration(fixture.actor, "SLACK", "https://hooks.slack.com/services/T/B/X");

      const result = await testWebhookIntegration(fixture.actor, "SLACK");
      expect(result.status).toBe("CONNECTED");

      const updated = await prisma.integration.findFirstOrThrow({ where: { organizationId: fixture.organization.id, kind: "SLACK" } });
      expect(updated.status).toBe("CONNECTED");
    });

    it("marque ERROR sur une réponse non-2xx", async () => {
      const fixture = await createWorkflowTestFixture("connector-test-failure");
      organizationIds.push(fixture.organization.id);
      userIds.push(fixture.user.id);

      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 404 }));
      await connectWebhookIntegration(fixture.actor, "SLACK", "https://hooks.slack.com/services/T/B/X");

      const result = await testWebhookIntegration(fixture.actor, "SLACK");
      expect(result.status).toBe("ERROR");
    });
  });

  describe("getUnifiedConnectorsView", () => {
    it("isole la vue par organisation", async () => {
      const fixtureA = await createWorkflowTestFixture("connector-view-a");
      const fixtureB = await createWorkflowTestFixture("connector-view-b");
      organizationIds.push(fixtureA.organization.id, fixtureB.organization.id);
      userIds.push(fixtureA.user.id, fixtureB.user.id);

      await connectWebhookIntegration(fixtureA.actor, "SLACK", "https://hooks.slack.com/services/T/B/X");

      const viewA = await getUnifiedConnectorsView(fixtureA.actor);
      const viewB = await getUnifiedConnectorsView(fixtureB.actor);
      expect(viewA.slack.status).toBe("CONNECTED");
      expect(viewB.slack.status).toBe("DISCONNECTED");
    });
  });
});
