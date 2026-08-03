import { requireWorkspaceActor } from "@/lib/workspace-context";
import { hasWorkspacePermission } from "@/lib/workspace-permissions";
import { resolveCommercialInstallation } from "@/lib/agents/commercial/commercial-service";
import { getCommercialDashboard } from "@/lib/agents/commercial/dashboard-service";
import { CommercialDashboardClient } from "@/components/commercial-dashboard-client";

export default async function CommercialPage() {
  const actor = await requireWorkspaceActor();

  if (!hasWorkspacePermission(actor.workspace.role, "VIEW_WORKSPACE")) {
    return (
      <div className="max-w-3xl">
        <p className="text-sm text-p360-danger">Vous n&apos;avez pas la permission de consulter l&apos;Agent Commercial.</p>
      </div>
    );
  }

  const [installation, dashboard] = await Promise.all([
    resolveCommercialInstallation(actor.workspace.id),
    getCommercialDashboard(actor.workspace.id),
  ]);

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-p360-ink">💼 Agent Commercial</h1>
        <p className="mt-1 text-sm text-p360-muted">
          Gère le cycle commercial complet : recherche, qualification, scoring, rédaction d&apos;emails, devis et
          recommandations. Aucun email, devis ou relance n&apos;est envoyé sans votre validation.
        </p>
      </div>

      <CommercialDashboardClient
        installed={!!installation}
        status={installation?.status ?? null}
        byStage={dashboard.byStage}
        prospects={dashboard.prospects.map((p) => ({
          id: p.id,
          companyName: p.companyName,
          sector: p.sector,
          companySize: p.companySize,
          stage: p.stage,
          score: p.score,
          website: p.website,
          createdAt: p.createdAt.toISOString(),
        }))}
        pendingActions={dashboard.pendingActions.map((a) => ({
          id: a.id,
          type: a.type,
          title: a.title,
          reasoning: a.reasoning,
          payload: a.payload,
          prospectCompanyName: a.prospect.companyName,
          createdAt: a.createdAt.toISOString(),
        }))}
        recentActions={dashboard.recentActions.map((a) => ({
          id: a.id,
          type: a.type,
          status: a.status,
          title: a.title,
          prospectCompanyName: a.prospect.companyName,
          createdAt: a.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
