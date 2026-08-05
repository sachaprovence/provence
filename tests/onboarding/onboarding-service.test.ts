import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { ensureAutomationTemplates } from "@/lib/automation/templates/seed-templates";
import {
  getOrCreateOnboardingProgress,
  completeOnboardingStep,
  chooseOnboardingTemplate,
  launchOnboardingDemo,
  getOnboardingDemoResult,
} from "@/lib/onboarding/onboarding-service";
import { OnboardingStepKey } from "@/generated/prisma/enums";
import { createWorkflowTestFixture, cleanupWorkflowTestFixtures } from "../helpers/workflow-fixtures";

/**
 * Onboarding guidé (v1.4, AR-0178) — vérifie la persistance/reprise de la
 * progression, l'ordre strict des étapes, l'idempotence du clonage de
 * template lors d'un retour en arrière, l'exécution réelle de la
 * démonstration jusqu'à un état terminal, et l'isolation multi-tenant de
 * chacune de ces opérations.
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const DEMO_TEMPLATE_KEY = "template-resume-quotidien";

runIfDatabase("onboarding-service (v1.4, AR-0178)", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await cleanupWorkflowTestFixtures(organizationIds, userIds);
  });

  describe("getOrCreateOnboardingProgress", () => {
    it("crée une progression par défaut (PROFILE, aucune étape terminée) puis la réutilise", async () => {
      const fixture = await createWorkflowTestFixture("onboarding-create");
      organizationIds.push(fixture.organization.id);
      userIds.push(fixture.user.id);

      const created = await getOrCreateOnboardingProgress(fixture.organization.id);
      expect(created.currentStep).toBe(OnboardingStepKey.PROFILE);
      expect(created.completedSteps).toEqual([]);

      const reused = await getOrCreateOnboardingProgress(fixture.organization.id);
      expect(reused.id).toBe(created.id);
    });
  });

  describe("completeOnboardingStep", () => {
    it("avance dans l'ordre strict, sans jamais sauter d'étape", async () => {
      const fixture = await createWorkflowTestFixture("onboarding-step-order");
      organizationIds.push(fixture.organization.id);
      userIds.push(fixture.user.id);
      await getOrCreateOnboardingProgress(fixture.organization.id);

      const afterProfile = await completeOnboardingStep(fixture.organization.id, OnboardingStepKey.PROFILE);
      expect(afterProfile.completedSteps).toEqual([OnboardingStepKey.PROFILE]);
      expect(afterProfile.currentStep).toBe(OnboardingStepKey.INVITE_TEAM);

      const afterInvite = await completeOnboardingStep(fixture.organization.id, OnboardingStepKey.INVITE_TEAM);
      expect(afterInvite.completedSteps).toEqual([OnboardingStepKey.PROFILE, OnboardingStepKey.INVITE_TEAM]);
      expect(afterInvite.currentStep).toBe(OnboardingStepKey.CONNECT_TOOL);
    });

    it("ne duplique jamais une étape déjà marquée terminée si elle est repassée", async () => {
      const fixture = await createWorkflowTestFixture("onboarding-step-idempotent");
      organizationIds.push(fixture.organization.id);
      userIds.push(fixture.user.id);
      await getOrCreateOnboardingProgress(fixture.organization.id);

      await completeOnboardingStep(fixture.organization.id, OnboardingStepKey.PROFILE);
      const again = await completeOnboardingStep(fixture.organization.id, OnboardingStepKey.PROFILE);
      expect(again.completedSteps).toEqual([OnboardingStepKey.PROFILE]);
    });

    it("marque completedAt à la dernière étape (VIEW_RESULT), sans étape suivante", async () => {
      const fixture = await createWorkflowTestFixture("onboarding-step-final");
      organizationIds.push(fixture.organization.id);
      userIds.push(fixture.user.id);
      await getOrCreateOnboardingProgress(fixture.organization.id);

      const finished = await completeOnboardingStep(fixture.organization.id, OnboardingStepKey.VIEW_RESULT);
      expect(finished.currentStep).toBe(OnboardingStepKey.VIEW_RESULT);
      expect(finished.completedAt).not.toBeNull();
    });
  });

  describe("chooseOnboardingTemplate + launchOnboardingDemo", () => {
    it("clone le template dans le workspace, l'active, et complète l'étape CHOOSE_TEMPLATE", async () => {
      await ensureAutomationTemplates();
      const fixture = await createWorkflowTestFixture("onboarding-choose-template");
      organizationIds.push(fixture.organization.id);
      userIds.push(fixture.user.id);

      const progress = await chooseOnboardingTemplate(fixture.actor, DEMO_TEMPLATE_KEY);
      expect(progress.selectedTemplateKey).toBe(DEMO_TEMPLATE_KEY);
      expect(progress.currentStep).toBe(OnboardingStepKey.LAUNCH_DEMO);
      expect(progress.demoAutomationId).not.toBeNull();

      const clone = await prisma.automation.findUniqueOrThrow({ where: { id: progress.demoAutomationId! } });
      expect(clone.workspaceId).toBe(fixture.workspace.id);
      expect(clone.isTemplate).toBe(false);
      expect(clone.activeVersionId).not.toBeNull();
    });

    it("réutilise le même clone si l'on choisit à nouveau le même modèle (idempotent, jamais d'échec sur clé déjà prise)", async () => {
      await ensureAutomationTemplates();
      const fixture = await createWorkflowTestFixture("onboarding-choose-template-again");
      organizationIds.push(fixture.organization.id);
      userIds.push(fixture.user.id);

      const first = await chooseOnboardingTemplate(fixture.actor, DEMO_TEMPLATE_KEY);
      const second = await chooseOnboardingTemplate(fixture.actor, DEMO_TEMPLATE_KEY);
      expect(second.demoAutomationId).toBe(first.demoAutomationId);

      const clones = await prisma.automation.count({
        where: { workspaceId: fixture.workspace.id, key: `${DEMO_TEMPLATE_KEY}-onboarding-${fixture.organization.id}` },
      });
      expect(clones).toBe(1);
    });

    it("refuse de lancer la démonstration si aucun modèle n'a été choisi", async () => {
      const fixture = await createWorkflowTestFixture("onboarding-launch-no-template");
      organizationIds.push(fixture.organization.id);
      userIds.push(fixture.user.id);
      await getOrCreateOnboardingProgress(fixture.organization.id);

      await expect(launchOnboardingDemo(fixture.actor)).rejects.toThrow(ValidationError);
    });

    it("déclenche réellement l'automatisation clonée, la mène jusqu'à un état terminal, journalise l'action, et complète LAUNCH_DEMO", async () => {
      await ensureAutomationTemplates();
      const fixture = await createWorkflowTestFixture("onboarding-launch-demo");
      organizationIds.push(fixture.organization.id);
      userIds.push(fixture.user.id);

      await chooseOnboardingTemplate(fixture.actor, DEMO_TEMPLATE_KEY);
      const progress = await launchOnboardingDemo(fixture.actor);
      expect(progress.currentStep).toBe(OnboardingStepKey.VIEW_RESULT);
      expect(progress.demoRunId).not.toBeNull();

      const run = await prisma.automationRun.findUniqueOrThrow({ where: { id: progress.demoRunId! } });
      expect(run.status).toBe("SUCCEEDED");

      const auditEntry = await prisma.auditLog.findFirst({
        where: { organizationId: fixture.organization.id, action: "onboarding.demo_launched", entityId: run.id },
      });
      expect(auditEntry).not.toBeNull();

      const result = await getOnboardingDemoResult(fixture.organization.id);
      expect(result?.id).toBe(run.id);
      expect(result?.automation.name).toContain("Résumé quotidien");
    });
  });

  describe("isolation multi-tenant", () => {
    it("la progression et le résultat de démonstration d'une organisation ne fuient jamais vers une autre", async () => {
      await ensureAutomationTemplates();
      const fixtureA = await createWorkflowTestFixture("onboarding-tenant-a");
      const fixtureB = await createWorkflowTestFixture("onboarding-tenant-b");
      organizationIds.push(fixtureA.organization.id, fixtureB.organization.id);
      userIds.push(fixtureA.user.id, fixtureB.user.id);

      await chooseOnboardingTemplate(fixtureA.actor, DEMO_TEMPLATE_KEY);
      await launchOnboardingDemo(fixtureA.actor);

      const progressB = await getOrCreateOnboardingProgress(fixtureB.organization.id);
      expect(progressB.selectedTemplateKey).toBeNull();
      expect(progressB.demoAutomationId).toBeNull();

      const resultB = await getOnboardingDemoResult(fixtureB.organization.id);
      expect(resultB).toBeNull();

      const cloneForA = await prisma.automation.findFirstOrThrow({
        where: { key: `${DEMO_TEMPLATE_KEY}-onboarding-${fixtureA.organization.id}` },
      });
      expect(cloneForA.workspaceId).toBe(fixtureA.workspace.id);
      expect(cloneForA.organizationId).toBe(fixtureA.organization.id);
    });
  });
});
