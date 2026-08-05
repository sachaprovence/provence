import { requireWorkspaceActor } from "@/lib/workspace-context";
import { prisma } from "@/lib/prisma";
import { getOrCreateOnboardingProgress, getOnboardingDemoResult } from "@/lib/onboarding/onboarding-service";
import { OnboardingWizard } from "@/components/onboarding-wizard";

export default async function OnboardingPage() {
  const actor = await requireWorkspaceActor();

  const [org, territories, progress, demoResult, templates] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: actor.organization.id } }),
    prisma.territory.findMany({ where: { organizationId: actor.organization.id } }),
    getOrCreateOnboardingProgress(actor.organization.id),
    getOnboardingDemoResult(actor.organization.id),
    prisma.automation.findMany({ where: { isTemplate: true, workspaceId: null }, orderBy: { name: "asc" } }),
  ]);

  return (
    <OnboardingWizard
      initialStep={progress.currentStep}
      organizationInitial={{
        name: org.name,
        description: org.description ?? "",
        website: org.website ?? "",
        pitch: org.pitch ?? "",
        services: org.services,
        zones: org.zones,
        pricingNote: org.pricingNote ?? "",
        portfolioLinks: org.portfolioLinks,
        availabilityNote: org.availabilityNote ?? "",
        tone: org.tone,
        emailSignature: org.emailSignature ?? "",
        dailySendLimit: org.dailySendLimit,
        rampUpEnabled: org.rampUpEnabled,
        requireMessageValidation: org.requireMessageValidation,
      }}
      territories={territories.map((t) => ({ id: t.id, name: t.name }))}
      templates={templates.map((t) => ({ key: t.key, name: t.name, description: t.description, category: t.category }))}
      demoResult={
        demoResult ? { id: demoResult.id, status: demoResult.status, automation: { name: demoResult.automation.name } } : null
      }
    />
  );
}
