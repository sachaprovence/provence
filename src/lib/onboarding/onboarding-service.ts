import "server-only";
import { prisma } from "@/lib/prisma";
import { ValidationError, NotFoundError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit";
import { cloneAutomationDefinition, activateAutomationVersion } from "@/lib/automation/registry/automation-service";
import { triggerManualAutomationRun, advanceAutomationRun, processAutomationJobs } from "@/lib/automation/executor/job-executor";
import { OnboardingStepKey } from "@/generated/prisma/enums";
import type { WorkspaceActor } from "@/lib/workspace-context";

/**
 * Onboarding guidé (v1.4, AR-0178) — remplace le formulaire unique de
 * `/onboarding` (profil d'entreprise seul) par un parcours en 6 étapes dont
 * la progression est persistée (`OnboardingProgress`, une ligne par
 * organisation) : reprenable d'une session à l'autre, et visible de la même
 * façon par tout coéquipier invité en cours de route.
 *
 * Chaque étape RÉUTILISE un système déjà existant plutôt que d'en créer un
 * nouveau : PROFILE (formulaire d'organisation déjà existant),
 * INVITE_TEAM (`inviteWorkspaceMember`), CONNECT_TOOL (page Paramètres/
 * Intégrations existante), CHOOSE_TEMPLATE + LAUNCH_DEMO (catalogue de
 * templates de l'Automation Engine, v0.9/v1.4).
 */
const STEP_ORDER: OnboardingStepKey[] = [
  OnboardingStepKey.PROFILE,
  OnboardingStepKey.INVITE_TEAM,
  OnboardingStepKey.CONNECT_TOOL,
  OnboardingStepKey.CHOOSE_TEMPLATE,
  OnboardingStepKey.LAUNCH_DEMO,
  OnboardingStepKey.VIEW_RESULT,
];

export async function getOrCreateOnboardingProgress(organizationId: string) {
  const existing = await prisma.onboardingProgress.findUnique({ where: { organizationId } });
  if (existing) return existing;
  return prisma.onboardingProgress.create({ data: { organizationId } });
}

function nextStep(current: OnboardingStepKey): OnboardingStepKey | null {
  const index = STEP_ORDER.indexOf(current);
  return index >= 0 && index < STEP_ORDER.length - 1 ? STEP_ORDER[index + 1] : null;
}

/** Marque `step` comme terminée et avance à l'étape suivante — jamais en arrière, jamais de saut. */
export async function completeOnboardingStep(organizationId: string, step: OnboardingStepKey) {
  const progress = await getOrCreateOnboardingProgress(organizationId);
  const advanced = nextStep(step);

  return prisma.onboardingProgress.update({
    where: { organizationId },
    data: {
      completedSteps: progress.completedSteps.includes(step) ? progress.completedSteps : [...progress.completedSteps, step],
      currentStep: advanced ?? step,
      completedAt: advanced ? undefined : new Date(),
    },
  });
}

/**
 * Clone le template choisi dans le workspace de l'acteur (jamais le template
 * global lui-même) et l'active — la clé du clone est déterministe
 * (`<template>-onboarding-<organisation>`) pour que revenir à cette étape
 * et choisir à nouveau (même modèle, ou un autre après un premier essai)
 * reste sans effet de bord : réutilise le clone déjà créé au lieu d'échouer
 * sur une clé déjà prise.
 */
export async function chooseOnboardingTemplate(actor: WorkspaceActor, templateKey: string) {
  await getOrCreateOnboardingProgress(actor.organization.id);

  const source = await prisma.automation.findFirst({ where: { key: templateKey, isTemplate: true, workspaceId: null } });
  if (!source) throw new NotFoundError(`Modèle "${templateKey}" introuvable.`);

  const cloneKey = `${templateKey}-onboarding-${actor.organization.id}`;
  const existingClone = await prisma.automation.findFirst({ where: { workspaceId: actor.workspace.id, key: cloneKey } });

  const automationId =
    existingClone?.id ??
    (
      await cloneAutomationDefinition(actor, source.id, { newKey: cloneKey, newName: `${source.name} (démo onboarding)` }).then(
        async (cloned) => {
          await activateAutomationVersion(actor, cloned.automation.id, cloned.version.id);
          return cloned.automation.id;
        }
      )
    );

  await prisma.onboardingProgress.update({
    where: { organizationId: actor.organization.id },
    data: { selectedTemplateKey: templateKey, demoAutomationId: automationId },
  });

  return completeOnboardingStep(actor.organization.id, OnboardingStepKey.CHOOSE_TEMPLATE);
}

/** Déclenche manuellement l'automatisation clonée et l'avance de quelques ticks (borné, jamais bloquant indéfiniment — même principe que `driveToTerminal` des tests). */
export async function launchOnboardingDemo(actor: WorkspaceActor) {
  const progress = await prisma.onboardingProgress.findUnique({ where: { organizationId: actor.organization.id } });
  if (!progress?.demoAutomationId) {
    throw new ValidationError("Choisissez d'abord un modèle avant de lancer la démonstration.");
  }

  const run = await triggerManualAutomationRun(actor, progress.demoAutomationId);

  // Borné (jamais bloquant indéfiniment) — mêmes deux appels que
  // `processQueuedAutomationRuns`/`processAutomationJobs` utilisés par les
  // tests (`driveToTerminal`) : `advanceAutomationRun` seul ne fait que
  // faire progresser l'état du graphe, jamais exécuter un job déjà mis en
  // file (`AutomationJob`), qui nécessite un tour du noyau de jobs.
  const TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT", "WAITING"]);
  let current = run;
  for (let i = 0; i < 20 && !TERMINAL.has(current.status); i += 1) {
    await advanceAutomationRun(current.id);
    await processAutomationJobs({ limit: 20 });
    current = await prisma.automationRun.findUniqueOrThrow({ where: { id: current.id } });
  }

  await prisma.onboardingProgress.update({ where: { organizationId: actor.organization.id }, data: { demoRunId: run.id } });
  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    action: "onboarding.demo_launched",
    entityType: "AutomationRun",
    entityId: run.id,
  });

  return completeOnboardingStep(actor.organization.id, OnboardingStepKey.LAUNCH_DEMO);
}

export async function getOnboardingDemoResult(organizationId: string) {
  const progress = await prisma.onboardingProgress.findUnique({ where: { organizationId } });
  if (!progress?.demoRunId) return null;
  return prisma.automationRun.findUnique({ where: { id: progress.demoRunId }, include: { automation: true } });
}
