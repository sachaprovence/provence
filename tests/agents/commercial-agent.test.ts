import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerBuiltInAgentComponents } from "@/lib/agents/bootstrap";
import { registerLlmProvider } from "@/lib/agents/llm/registry";
import { installAgent, transitionInstallation } from "@/lib/agents/installation-service";
import { createAgentRun, executeAgentRun } from "@/lib/agents/execution-engine";
import { listObjections } from "@/lib/agents/commercial/memory";
import type { LlmProvider } from "@/lib/agents/llm/types";
import { createCommercialTestFixture, cleanupAgentTestFixtures } from "../helpers/agent-fixtures";

/**
 * Test d'intégration (nécessite une vraie base PostgreSQL) : Agent
 * Commercial (v0.5) — qualification, scoring, génération, mémoire,
 * permissions, reprise après erreur, journalisation. La délégation depuis
 * le Director est testée séparément
 * (`commercial-director-delegation.test.ts`).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Agent Commercial", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];
  const definitionIds: string[] = [];

  beforeAll(() => {
    registerBuiltInAgentComponents();
  });

  afterAll(async () => {
    await cleanupAgentTestFixtures(organizationIds, userIds, definitionIds);
  });

  async function setupCommercial(suffix: string, permissions: string[] = ["MANAGE_LEADS", "MANAGE_FINANCE", "VIEW_WORKSPACE"]) {
    const fixture = await createCommercialTestFixture(suffix);
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    definitionIds.push(fixture.definition.id, fixture.commercialDefinition.id);

    const installation = await installAgent(fixture.actor, {
      definitionId: fixture.commercialDefinition.id,
      toolKeys: [
        "commercial.create_prospect",
        "commercial.search_prospects",
        "commercial.enrich_prospect",
        "commercial.qualify_prospect",
        "commercial.score_prospect",
        "commercial.estimate_potential",
        "commercial.draft_email",
        "commercial.draft_followup",
        "commercial.draft_proposal",
        "commercial.draft_quote",
        "commercial.recommend_next_actions",
      ],
      permissions,
    });
    await transitionInstallation(fixture.actor, installation.id, "activate");

    return { ...fixture, installation };
  }

  async function runAction(installationId: string, input: unknown, opts: { maxAttempts?: number } = {}) {
    const run = await createAgentRun({ installationId, input, maxAttempts: opts.maxAttempts ?? 1 });
    await executeAgentRun(run.id);
    return prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } });
  }

  it("crée un prospect puis le qualifie (transition de pipeline)", async () => {
    const { installation } = await setupCommercial("qualify");

    const createRun = await runAction(installation.id, { action: "create_prospect", data: { companyName: "Qualif SARL" } });
    expect(createRun.status).toBe("SUCCEEDED");
    const prospectId = (createRun.output as { prospect: { id: string } }).prospect.id;

    const prospectBefore = await prisma.commercialProspect.findUniqueOrThrow({ where: { id: prospectId } });
    expect(prospectBefore.stage).toBe("NEW");

    const qualifyRun = await runAction(installation.id, {
      action: "qualify_prospect",
      prospectId,
      stage: "QUALIFIED",
      notes: "Correspond à notre cible.",
    });
    expect(qualifyRun.status).toBe("SUCCEEDED");

    const prospectAfter = await prisma.commercialProspect.findUniqueOrThrow({ where: { id: prospectId } });
    expect(prospectAfter.stage).toBe("QUALIFIED");
    expect(prospectAfter.qualificationNotes).toBe("Correspond à notre cible.");
  });

  it("attribue un score qui prend en compte les faits connus du prospect", async () => {
    const { installation } = await setupCommercial("scoring");

    const createRun = await runAction(installation.id, {
      action: "create_prospect",
      data: { companyName: "Score SARL", sector: "finance", companySize: "250+", website: "https://score.example" },
    });
    const prospectId = (createRun.output as { prospect: { id: string } }).prospect.id;

    const scoreRun = await runAction(installation.id, { action: "score_prospect", prospectId });
    expect(scoreRun.status).toBe("SUCCEEDED");
    const output = scoreRun.output as { score: number };
    expect(output.score).toBeGreaterThan(0);

    const prospect = await prisma.commercialProspect.findUniqueOrThrow({ where: { id: prospectId } });
    expect(prospect.score).toBe(output.score);
    expect(prospect.scoreBreakdown).not.toBeNull();
  });

  it("génère un premier email personnalisé, toujours en attente d'approbation (jamais envoyé automatiquement)", async () => {
    const { installation } = await setupCommercial("generation");

    const createRun = await runAction(installation.id, {
      action: "create_prospect",
      data: { companyName: "Génération SARL", contactName: "Jordan" },
    });
    const prospectId = (createRun.output as { prospect: { id: string } }).prospect.id;

    const emailRun = await runAction(installation.id, { action: "draft_email", prospectId });
    expect(emailRun.status).toBe("SUCCEEDED");

    const actions = await prisma.commercialAction.findMany({ where: { prospectId } });
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("EMAIL_DRAFT");
    expect(actions[0].status).toBe("PENDING_APPROVAL");
    expect(actions[0].autoApproved).toBe(false);
    const payload = actions[0].payload as { subject: string; body: string };
    expect(payload.body.length).toBeGreaterThan(0);
  });

  it("le mode autonome (config.autonomousMode) crée des actions déjà approuvées, mais ne les envoie jamais automatiquement", async () => {
    const fixture = await createCommercialTestFixture("autonomous");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    definitionIds.push(fixture.definition.id, fixture.commercialDefinition.id);

    const installation = await installAgent(fixture.actor, {
      definitionId: fixture.commercialDefinition.id,
      config: { autonomousMode: true },
      toolKeys: ["commercial.create_prospect", "commercial.draft_email"],
      permissions: ["MANAGE_LEADS", "VIEW_WORKSPACE"],
    });
    await transitionInstallation(fixture.actor, installation.id, "activate");

    const createRun = await runAction(installation.id, { action: "create_prospect", data: { companyName: "Autonome SARL" } });
    const prospectId = (createRun.output as { prospect: { id: string } }).prospect.id;

    await runAction(installation.id, { action: "draft_email", prospectId });

    const action = await prisma.commercialAction.findFirstOrThrow({ where: { prospectId } });
    expect(action.status).toBe("APPROVED");
    expect(action.autoApproved).toBe(true);
    expect(action.sentAt).toBeNull(); // jamais envoyé automatiquement, même en mode autonome
  });

  it("mémorise les objections reçues et les prend en compte dans la relance suivante", async () => {
    const { installation } = await setupCommercial("memory");

    const createRun = await runAction(installation.id, { action: "create_prospect", data: { companyName: "Mémoire SARL" } });
    const prospectId = (createRun.output as { prospect: { id: string } }).prospect.id;

    await runAction(installation.id, {
      action: "draft_followup",
      prospectId,
      objection: "Le budget est déjà engagé cette année.",
    });

    const objections = await listObjections(installation, prospectId);
    expect(objections).toHaveLength(1);
    expect(objections[0].objection).toContain("budget");

    const actions = await prisma.commercialAction.findMany({ where: { prospectId, type: "FOLLOW_UP" } });
    expect(actions).toHaveLength(1);
  });

  it("refuse de préparer un devis si l'installation n'a pas la permission MANAGE_FINANCE", async () => {
    const { installation } = await setupCommercial("permissions-denied", ["MANAGE_LEADS", "VIEW_WORKSPACE"]);

    const createRun = await runAction(installation.id, { action: "create_prospect", data: { companyName: "Permissions SARL" } });
    const prospectId = (createRun.output as { prospect: { id: string } }).prospect.id;

    const quoteRun = await runAction(installation.id, {
      action: "draft_quote",
      prospectId,
      quote: { amount: 5000 },
    });
    expect(quoteRun.status).toBe("FAILED");
    expect(JSON.stringify(quoteRun.error)).toContain("MANAGE_FINANCE");

    const deniedLog = await prisma.auditLog.findFirst({
      where: { organizationId: installation.organizationId, action: "agent.permission_access_denied", entityId: installation.id },
    });
    expect(deniedLog).not.toBeNull();
  });

  it("retente automatiquement après un échec du fournisseur LLM, puis réussit", async () => {
    const { installation } = await setupCommercial("retry");

    const createRun = await runAction(installation.id, { action: "create_prospect", data: { companyName: "Retry SARL" } });
    const prospectId = (createRun.output as { prospect: { id: string } }).prospect.id;

    let attempts = 0;
    const flakyProvider: LlmProvider = {
      key: "test-flaky-commercial",
      defaultModel: "test-model",
      async complete() {
        attempts += 1;
        if (attempts === 1) throw new Error("panne réseau simulée");
        return { text: "Texte généré après reprise.", provider: "test-flaky-commercial", model: "test-model" };
      },
    };
    registerLlmProvider(flakyProvider);

    const previousProviderEnv = process.env.LLM_PROVIDER;
    process.env.LLM_PROVIDER = "test-flaky-commercial";
    try {
      const run = await createAgentRun({
        installationId: installation.id,
        input: { action: "draft_email", prospectId },
        maxAttempts: 2,
      });

      await executeAgentRun(run.id);
      const afterFirst = await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } });
      expect(afterFirst.status).toBe("QUEUED");
      expect(afterFirst.attempt).toBe(1);

      await executeAgentRun(run.id);
      const afterSecond = await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } });
      expect(afterSecond.status).toBe("SUCCEEDED");
      expect(afterSecond.attempt).toBe(2);
    } finally {
      if (previousProviderEnv) process.env.LLM_PROVIDER = previousProviderEnv;
      else delete process.env.LLM_PROVIDER;
    }
  });

  it("journalise chaque étape significative de l'exécution", async () => {
    const { installation } = await setupCommercial("logging");

    const createRun = await runAction(installation.id, { action: "create_prospect", data: { companyName: "Journal SARL" } });
    const logs = await prisma.agentRunLog.findMany({ where: { runId: createRun.id } });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.some((l) => l.message.includes("Action demandée"))).toBe(true);
  });
});
