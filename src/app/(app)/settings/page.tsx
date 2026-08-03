import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OrganizationForm } from "@/components/organization-form";
import { ScoringRulesEditor } from "@/components/scoring-rules-editor";
import { AutomationRulesEditor } from "@/components/automation-rules-editor";
import { TerritoriesManager } from "@/components/territories-manager";
import { ServicesManager } from "@/components/services-manager";
import { IcpManager } from "@/components/icp-manager";
import { PipelineStagesManager } from "@/components/pipeline-stages-manager";
import { EmailSettingsForm } from "@/components/email-settings-form";
import { DEFAULT_SCORING_RULES, type ScoringRule } from "@/lib/scoring";
import { getPipelineStages } from "@/lib/crm/pipeline-service";
import { listRegisteredLlmProviderKeys, registerBuiltInLlmProviders } from "@/lib/agents/llm";
import { MembershipRole } from "@/generated/prisma/enums";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ calendar?: string; reason?: string }> }) {
  const actor = await requireRole([MembershipRole.OWNER_ADMIN]);
  const sp = await searchParams;

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

      {sp.calendar === "connected" && (
        <div className="card p-3 text-sm text-p360-success border-p360-success">Google Calendar connecté avec succès.</div>
      )}
      {sp.calendar === "error" && (
        <div className="card p-3 text-sm text-p360-danger border-p360-danger">
          Échec de la connexion à Google Calendar{sp.reason ? ` (${sp.reason})` : ""}.
        </div>
      )}

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
            logoUrl: org.logoUrl ?? "",
            vatNumber: org.vatNumber ?? "",
            siret: org.siret ?? "",
            legalAddress: org.legalAddress ?? "",
            phone: org.phone ?? "",
            invoicePrefix: org.invoicePrefix ?? "FA",
            quotePrefix: org.quotePrefix ?? "DEV",
          }}
        />
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-semibold text-p360-ink mb-2">Email</h2>
        <p className="text-sm text-p360-muted mb-4">
          Identifiants du fournisseur d&apos;envoi réel actif (choisi par la variable de déploiement <code>EMAIL_PROVIDER</code> : smtp/resend/postmark/brevo). Sans identifiant renseigné ici ni en variable d&apos;environnement, l&apos;envoi échoue explicitement (aucune simulation).
        </p>
        <EmailSettingsForm />
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-semibold text-p360-ink mb-2">Intelligence artificielle</h2>
        <AiSettingsStatus />
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
        <li key={i.id} className="py-2 flex justify-between items-center">
          <span className="text-p360-ink">{i.name}</span>
          <div className="flex items-center gap-2">
            <span className={i.status === "CONNECTED" ? "badge bg-green-100 text-p360-success" : "badge bg-p360-sand-light text-p360-warning"}>
              {i.status === "DEMO" ? "Mode démo" : i.status === "CONNECTED" ? "Connecté" : i.status}
            </span>
            {i.kind === "CALENDAR" && i.status !== "CONNECTED" && (
              <a href="/api/calendar/google/connect" className="btn-secondary text-xs">Connecter Google Calendar</a>
            )}
          </div>
        </li>
      ))}
      <li className="pt-3 text-xs text-p360-muted">
        Variable d&apos;environnement <code>EMAIL_PROVIDER</code> (choix du fournisseur — identifiants ci-dessus), <code>GOOGLE_OAUTH_CLIENT_ID</code>/<code>GOOGLE_OAUTH_CLIENT_SECRET</code>/<code>GOOGLE_OAUTH_REDIRECT_URI</code> pour Google Calendar.
      </li>
    </ul>
  );
}

/**
 * Le CHOIX du fournisseur IA est un réglage de déploiement (variable
 * d'environnement, voir ADR 0015) — jamais par organisation, contrairement
 * aux identifiants email (task #92). Cette section affiche donc un statut
 * honnête plutôt qu'un formulaire qui n'agirait sur rien.
 */
async function AiSettingsStatus() {
  registerBuiltInLlmProviders();
  const llmProvider = process.env.LLM_PROVIDER ?? "demo";
  const legacyAiProvider = process.env.AI_PROVIDER ?? "demo";
  return (
    <div className="text-sm text-p360-ink space-y-2">
      <p>
        Framework des Agents (7 agents métier, Commercial, Director) : fournisseur actif{" "}
        <span className="badge bg-p360-lavender-light">{llmProvider}</span>. Fournisseurs disponibles :{" "}
        {listRegisteredLlmProviderKeys().join(", ")}.
      </p>
      <p>
        Analyse/scoring historique (<code>src/lib/ai/</code>) : fournisseur actif{" "}
        <span className="badge bg-p360-lavender-light">{legacyAiProvider}</span>.
      </p>
      <p className="text-xs text-p360-muted">
        Le choix du fournisseur se fait via les variables d&apos;environnement <code>LLM_PROVIDER</code>/<code>AI_PROVIDER</code> au déploiement (clé API requise pour un fournisseur réel) — voir README.
      </p>
    </div>
  );
}
