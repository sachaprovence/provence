import { requireActor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OnboardingClient } from "@/components/onboarding-client";

export default async function OnboardingPage() {
  const actor = await requireActor();
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: actor.organization.id } });

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-p360-ink">Configurons votre entreprise</h1>
      <p className="text-p360-muted mt-1 mb-6">
        Ces informations servent de base à l&apos;analyse des prospects et à la génération des messages. Vous pourrez les modifier à tout moment dans Paramètres.
      </p>
      <div className="card p-6">
        <OnboardingClient
          initial={{
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
        />
      </div>
    </div>
  );
}
