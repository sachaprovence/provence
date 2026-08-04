import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createWorkflowDefinition, activateVersion } from "@/lib/workflows/workflow-service";
import { createAutomationDefinition, activateAutomationVersion } from "@/lib/automation/registry/automation-service";
import { ensureWebhookTriggerConfig, timingSafeStringEqual, isValidCronRequest } from "@/lib/security/webhook-secret";
import { POST as workflowWebhook } from "@/app/api/webhooks/workflows/[workspaceId]/[workflowKey]/route";
import { POST as automationWebhook } from "@/app/api/webhooks/automations/[workspaceId]/[automationKey]/route";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";
import type { WorkflowGraph } from "@/lib/workflows/graph-types";
import type { AutomationGraph } from "@/lib/automation/graph-types";

/**
 * Secret de webhook obligatoire (v0.10, AR-0156) — corrige une faille
 * réelle : le secret était auparavant optionnel
 * (`if (configuredSecret) { ... }`), laissant tout déclencheur webhook
 * créé sans secret ouvert à quiconque devine `workspaceId` + `workflowKey`/
 * `automationKey`. Vérifie : (1) `ensureWebhookTriggerConfig` génère
 * toujours un secret pour un déclencheur webhook sans en fournir un ;
 * (2) l'activation réelle d'un workflow/d'une automatisation avec un
 * déclencheur webhook produit TOUJOURS une liaison avec un secret ;
 * (3) les deux routes webhook rejettent explicitement une requête sans
 * secret ou avec un secret incorrect, et acceptent la bonne valeur.
 */
describe("ensureWebhookTriggerConfig", () => {
  it("génère un secret pour un déclencheur webhook.received sans configuration", () => {
    const config = ensureWebhookTriggerConfig("webhook.received", null);
    expect(typeof (config as { secret?: string }).secret).toBe("string");
    expect((config as { secret: string }).secret.length).toBeGreaterThanOrEqual(32);
  });

  it("conserve un secret déjà fourni explicitement", () => {
    const config = ensureWebhookTriggerConfig("webhook.received", { secret: "already-set" });
    expect((config as { secret: string }).secret).toBe("already-set");
  });

  it("ne touche jamais la config d'un déclencheur non-webhook", () => {
    const config = ensureWebhookTriggerConfig("lead.created", { foo: "bar" });
    expect(config).toEqual({ foo: "bar" });
  });
});

describe("timingSafeStringEqual", () => {
  it("compare correctement des chaînes égales et différentes", () => {
    expect(timingSafeStringEqual("abc", "abc")).toBe(true);
    expect(timingSafeStringEqual("abc", "abd")).toBe(false);
    expect(timingSafeStringEqual("abc", "abcd")).toBe(false);
  });
});

describe("isValidCronRequest (v1.3, AR-0176)", () => {
  const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;
  afterEach(() => {
    if (ORIGINAL_CRON_SECRET === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
  });

  function cronRequest(authorization?: string): Request {
    return new Request("http://localhost/api/cron/process-sequences", {
      method: "POST",
      headers: authorization ? { authorization } : undefined,
    });
  }

  it("refuse toujours si CRON_SECRET n'est pas configuré, même avec un en-tête présent", () => {
    delete process.env.CRON_SECRET;
    expect(isValidCronRequest(cronRequest("Bearer whatever"))).toBe(false);
  });

  it("refuse une requête sans en-tête Authorization", () => {
    process.env.CRON_SECRET = "le-vrai-secret";
    expect(isValidCronRequest(cronRequest())).toBe(false);
  });

  it("refuse un secret incorrect", () => {
    process.env.CRON_SECRET = "le-vrai-secret";
    expect(isValidCronRequest(cronRequest("Bearer mauvais-secret"))).toBe(false);
  });

  it("accepte le bon secret sous la forme Bearer <secret>", () => {
    process.env.CRON_SECRET = "le-vrai-secret";
    expect(isValidCronRequest(cronRequest("Bearer le-vrai-secret"))).toBe(true);
  });
});

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

function graph(triggerKey: string): WorkflowGraph & AutomationGraph {
  return {
    nodes: [
      { id: "t1", type: "trigger", position: { x: 0, y: 0 }, data: { triggerKey } },
      { id: "end1", type: "end", position: { x: 0, y: 100 }, data: {} },
    ],
    edges: [{ id: "e1", source: "t1", target: "end1" }],
  };
}

function webhookRequest(secret?: string) {
  return new Request("http://localhost/webhook", {
    method: "POST",
    headers: secret ? { "x-webhook-secret": secret } : undefined,
    body: JSON.stringify({ hello: "world" }),
  });
}

runIfDatabase("Secret de webhook obligatoire — Workflow Engine", () => {
  it("activateVersion génère toujours un secret, et la route l'exige", async () => {
    const fixture = await createWorkflowTestFixture("webhook-secret-workflow");

    const { definition, version } = await createWorkflowDefinition(fixture.actor, {
      key: "webhook-secret-test",
      name: "Webhook secret",
      category: "test",
      graph: graph("webhook.received"),
    });
    await activateVersion(fixture.actor, definition.id, version.id);

    const binding = await prisma.workflowTriggerBinding.findFirstOrThrow({ where: { workflowDefinitionId: definition.id } });
    const secret = (binding.config as { secret?: string } | null)?.secret;
    expect(typeof secret).toBe("string");
    expect(secret!.length).toBeGreaterThanOrEqual(32);

    const params = Promise.resolve({ workspaceId: fixture.workspace.id, workflowKey: "webhook-secret-test" });

    const withoutSecret = await workflowWebhook(webhookRequest(), { params });
    expect(withoutSecret.status).toBe(403);

    const withWrongSecret = await workflowWebhook(webhookRequest("wrong-secret"), { params });
    expect(withWrongSecret.status).toBe(403);

    const withCorrectSecret = await workflowWebhook(webhookRequest(secret!), { params });
    expect(withCorrectSecret.status).toBe(202);

    await cleanupWorkflowTestFixtures([fixture.organization.id], [fixture.user.id]);
  });
});

runIfDatabase("Secret de webhook obligatoire — Automation Engine", () => {
  it("activateAutomationVersion génère toujours un secret, et la route l'exige", async () => {
    const fixture = await createWorkflowTestFixture("webhook-secret-automation");

    const { automation, version } = await createAutomationDefinition(fixture.actor, {
      key: "webhook-secret-automation-test",
      name: "Webhook secret automation",
      category: "test",
      graph: graph("webhook.received"),
    });
    await activateAutomationVersion(fixture.actor, automation.id, version.id);

    const binding = await prisma.automationTriggerBinding.findFirstOrThrow({ where: { automationId: automation.id } });
    const secret = (binding.config as { secret?: string } | null)?.secret;
    expect(typeof secret).toBe("string");
    expect(secret!.length).toBeGreaterThanOrEqual(32);

    const params = Promise.resolve({ workspaceId: fixture.workspace.id, automationKey: "webhook-secret-automation-test" });

    const withoutSecret = await automationWebhook(webhookRequest(), { params });
    expect(withoutSecret.status).toBe(403);

    const withWrongSecret = await automationWebhook(webhookRequest("wrong-secret"), { params });
    expect(withWrongSecret.status).toBe(403);

    const withCorrectSecret = await automationWebhook(webhookRequest(secret!), { params });
    expect(withCorrectSecret.status).toBe(202);

    await cleanupWorkflowTestFixtures([fixture.organization.id], [fixture.user.id]);
  });
});
