import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OrganizationForm } from "@/components/organization-form";
import { ScoringRulesEditor } from "@/components/scoring-rules-editor";
import { AutomationRulesEditor } from "@/components/automation-rules-editor";
import { TerritoriesManager } from "@/components/territories-manager";
import { ServicesManager } from "@/components/services-manager";
import { IcpManager } from "@/components/icp-manager";
import { PipelineStagesManager } from "@/components/pipeline-stages-manager";
import { DEFAULT_SCORING_RULES, type ScoringRule } from "@/lib/scoring";
import { getPipelineStages } from "@/lib/crm/pipeline-service";
import { MembershipRole } from "@/generated/prisma/enums";

export default async function SettingsPage() {
  const actor = await requireRole([MembershipRole.OWNER_ADMIN]);

  const [org, automationRules, territories, services, icps, pipelineStages] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: actor.organization.id } }),
    prisma.automationRule.findMany({ where: { organizationId: actor.organization.id }, orderBy: { name: "asc" } }),
    prisma.territory.findMany({ where: { organizationId: actor.organization.id }, include: { _count: { select: { leads: true, providers: true, missions: true } } }, orderBy: { name: "asc" } }),
    prisma.service.findMany({ where: { organizationId: actor.organization.id, isActive: true }, orderBy: { basePrice: "asc" } }),
    prisma.idealCustomerProfile.findMany({ where: { organizationId: actor.organization.id }, include: { _count: { select: { leads: true } } }, orderBy: { createdAt: "desc" } }),
    getPipelineStages(actor.organization.id),
  ]);

  const scoringRules = (org.scoringRules as unknown as ScoringRule[] | null) ?? DEFAULT_SCORING_RULES;

  return (
    <div className="max-w-4xl space-y-8">
      <h1 className="text-2xl font-semibold text-p360-ink">Paramètres</h1>

      <section className="card p-6">
        <h2 className="text-lg font-semibold text-p360-ink mb-4">Entreprise</h2>
        <OrganizationForm
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
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-semibold text-p360-ink mb-4">Profils de client idéal (ICP)</h2>
        <IcpManager icps={icps} />
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-semibold text-p360-ink mb-2">Règles de scoring</h2>
        <p className="text-sm text-p360-muted mb-4">Score sur 100. 80-100 : priorité immédiate · 60-79 : intéressant · 40-59 : à vérifier · &lt;40 : faible priorité.</p>
        <ScoringRulesEditor initialRules={scoringRules} />
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-semibold text-p360-ink mb-4">Automatisations internes</h2>
        <AutomationRulesEditor initialRules={automationRules.map((r) => ({ id: r.id, name: r.name, isActive: r.isActive }))} />
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-semibold text-p360-ink mb-2">Pipeline commercial</h2>
        <p className="text-sm text-p360-muted mb-4">Renommez, recolorez et réordonnez les étapes du pipeline (Kanban et fiche prospect). Le comportement métier de chaque étape ne change jamais.</p>
        <PipelineStagesManager stages={pipelineStages} />
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-semibold text-p360-ink mb-4">Territoires</h2>
        <TerritoriesManager territories={territories} />
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-semibold text-p360-ink mb-4">Offres commerciales</h2>
        <ServicesManager services={services} />
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-semibold text-p360-ink mb-4">Intégrations</h2>
        <IntegrationsList organizationId={actor.organization.id} />
      </section>
    </div>
  );
}

async function IntegrationsList({ organizationId }: { organizationId: string }) {
  const integrations = await prisma.integration.findMany({ where: { organizationId } });
  return (
    <ul className="divide-y divide-p360-lavender-light text-sm">
      {integrations.map((i) => (
        <li key={i.id} className="py-2 flex justify-between">
          <span className="text-p360-ink">{i.name}</span>
          <span className="badge bg-p360-sand-light text-p360-warning">{i.status === "DEMO" ? "Mode démo" : i.status}</span>
        </li>
      ))}
      <li className="pt-3 text-xs text-p360-muted">
        Variables d&apos;environnement <code>EMAIL_PROVIDER</code> et <code>AI_PROVIDER</code> — remplacer <code>demo</code> par un fournisseur réel une fois implémenté (voir README).
      </li>
    </ul>
  );
}
