import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { assertEmailQuotaAvailable, getEmailSentTodayCount, resolveDailyEmailLimit } from "@/lib/email/quota";
import { getEmailProviderForOrganization } from "@/lib/email";
import { QuotaExceededError } from "@/lib/errors";
import { getAutomationJobHandler } from "@/lib/automation/actions/registry";
import { registerBuiltInAutomationActions } from "@/lib/automation/actions";
import { getWorkflowAction } from "@/lib/workflows/actions/registry";
import { registerBuiltInWorkflowComponents } from "@/lib/workflows/bootstrap";
import { registerBuiltInAgentComponents } from "@/lib/agents/bootstrap";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";
import { MessageStatus, MessageType } from "@/generated/prisma/enums";

/**
 * Quota email quotidien dur par organisation (v0.10, AR-0057) — généralise
 * `Organization.dailySendLimit`/`EmailAccount.dailyLimit`, déjà bloquant
 * dans `sequence-engine.ts` mais jusqu'ici totalement absent des points
 * d'envoi réel du Workflow Engine et de l'Automation Engine (action
 * `email.send`, qui appelait `getEmailProvider()` directement, sans
 * aucune vérification de quota). Vérifie : (1) le comptage et la
 * résolution de la limite (priorité `EmailAccount.dailyLimit` sur
 * `Organization.dailySendLimit`) ; (2) le blocage à la limite exacte ;
 * (3) l'isolation multi-tenant du quota ; (4) le blocage réel des deux
 * actions `email.send` (Automation Engine ET Workflow Engine) une fois le
 * quota atteint.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

async function createSentMessage(organizationId: string) {
  const lead = await prisma.lead.create({ data: { organizationId, establishmentName: "Lead quota email" } });
  return prisma.message.create({
    data: {
      leadId: lead.id,
      type: MessageType.FIRST_CONTACT_EMAIL,
      body: "Corps",
      status: MessageStatus.SENT,
      sentAt: new Date(),
    },
  });
}

runIfDatabase("Quota email — assertEmailQuotaAvailable / resolveDailyEmailLimit", () => {
  const organizationIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  it("résout la limite de l'organisation quand aucun EmailAccount actif n'existe", async () => {
    const organization = await prisma.organization.create({ data: { name: "Org quota email org-level", dailySendLimit: 5 } });
    organizationIds.push(organization.id);

    expect(await resolveDailyEmailLimit(organization.id)).toBe(5);
  });

  it("priorise la limite de l'EmailAccount actif sur celle de l'organisation", async () => {
    const organization = await prisma.organization.create({ data: { name: "Org quota email account-level", dailySendLimit: 50 } });
    organizationIds.push(organization.id);
    await prisma.emailAccount.create({
      data: { organizationId: organization.id, fromName: "Test", fromEmail: "a@b.test", dailyLimit: 2, isActive: true },
    });

    expect(await resolveDailyEmailLimit(organization.id)).toBe(2);
  });

  it("ne compte que les messages SENT du jour, isolés par organisation", async () => {
    const organization = await prisma.organization.create({ data: { name: "Org quota email compte" } });
    organizationIds.push(organization.id);
    await createSentMessage(organization.id);
    await createSentMessage(organization.id);

    expect(await getEmailSentTodayCount(organization.id)).toBe(2);
  });

  it("laisse passer une organisation sous son quota", async () => {
    const organization = await prisma.organization.create({ data: { name: "Org quota email disponible", dailySendLimit: 10 } });
    organizationIds.push(organization.id);
    await createSentMessage(organization.id);

    await expect(assertEmailQuotaAvailable(organization.id)).resolves.toBeUndefined();
  });

  it("bloque explicitement dès que le nombre d'envois atteint la limite exacte", async () => {
    const organization = await prisma.organization.create({ data: { name: "Org quota email limite exacte", dailySendLimit: 2 } });
    organizationIds.push(organization.id);
    await createSentMessage(organization.id);
    await createSentMessage(organization.id);

    await expect(assertEmailQuotaAvailable(organization.id)).rejects.toThrow(QuotaExceededError);
    await expect(assertEmailQuotaAvailable(organization.id)).rejects.toThrow(/quota/i);
  });

  it("isolation multi-tenant : le quota atteint d'une organisation ne bloque jamais une autre", async () => {
    const orgA = await prisma.organization.create({ data: { name: "Org quota email A", dailySendLimit: 1 } });
    const orgB = await prisma.organization.create({ data: { name: "Org quota email B", dailySendLimit: 1 } });
    organizationIds.push(orgA.id, orgB.id);
    await createSentMessage(orgA.id);

    await expect(assertEmailQuotaAvailable(orgA.id)).rejects.toThrow(QuotaExceededError);
    await expect(assertEmailQuotaAvailable(orgB.id)).resolves.toBeUndefined();
  });
});

runIfDatabase("Quota email — getEmailProviderForOrganization", () => {
  const organizationIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  it("refuse de retourner un fournisseur quand le quota est dépassé", async () => {
    const organization = await prisma.organization.create({ data: { name: "Org quota email provider", dailySendLimit: 1 } });
    organizationIds.push(organization.id);
    await createSentMessage(organization.id);

    await expect(getEmailProviderForOrganization(organization.id)).rejects.toThrow(QuotaExceededError);
  });

  it("retourne bien un fournisseur quand le quota est disponible", async () => {
    const organization = await prisma.organization.create({ data: { name: "Org quota email provider ok", dailySendLimit: 50 } });
    organizationIds.push(organization.id);

    const provider = await getEmailProviderForOrganization(organization.id);
    expect(provider.name).toBe("demo");
  });
});

runIfDatabase("Quota email — action email.send (Automation Engine) bloquée réellement une fois le quota atteint", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  it("email.send échoue explicitement (QuotaExceededError) quand la limite quotidienne est atteinte", async () => {
    registerBuiltInAutomationActions();
    const fixture = await createWorkflowTestFixture("automation-email-quota");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    await prisma.organization.update({ where: { id: fixture.organization.id }, data: { dailySendLimit: 1 } });
    await createSentMessage(fixture.organization.id);

    const action = getAutomationJobHandler("email.send")!;
    await expect(
      action.execute(
        { fromName: "Autorun", fromEmail: "a@b.test", toEmail: "c@d.test", subject: "Sujet", body: "Corps" },
        {
          organizationId: fixture.organization.id,
          workspaceId: fixture.workspace.id,
          jobId: "job-quota-test",
          runId: "run-quota-test",
          nodeId: "node-quota-test",
          setVariable: () => undefined,
          log: async () => undefined,
        }
      )
    ).rejects.toThrow(QuotaExceededError);
  });
});

runIfDatabase("Quota email — action email.send (Workflow Engine) bloquée réellement une fois le quota atteint", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  it("email.send échoue explicitement (QuotaExceededError) quand la limite quotidienne est atteinte", async () => {
    registerBuiltInAgentComponents();
    registerBuiltInWorkflowComponents();
    const fixture = await createWorkflowTestFixture("workflow-email-quota");
    organizationIds.push(fixture.organization.id);
    userIds.push(fixture.user.id);
    await prisma.organization.update({ where: { id: fixture.organization.id }, data: { dailySendLimit: 1 } });
    await createSentMessage(fixture.organization.id);

    const action = getWorkflowAction("email.send")!;
    await expect(
      action.execute(
        { fromName: "Autorun", fromEmail: "a@b.test", toEmail: "c@d.test", subject: "Sujet", body: "Corps" },
        {
          organizationId: fixture.organization.id,
          workspaceId: fixture.workspace.id,
          runId: "run-quota-test",
          nodeId: "node-quota-test",
          setVariable: () => undefined,
          log: async () => undefined,
        }
      )
    ).rejects.toThrow(QuotaExceededError);
  });
});
