import { requireWorkspaceActor } from "@/lib/workspace-context";
import { hasWorkspacePermission } from "@/lib/workspace-permissions";
import { getKnowledgeDashboard } from "@/lib/knowledge/dashboard-service";
import { getMemoryDashboard } from "@/lib/memory/dashboard-service";
import { StatTile } from "@/components/stat-tile";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function formatMs(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)} ms`;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(4)}`;
}

export default async function KnowledgeDashboardPage() {
  const actor = await requireWorkspaceActor();

  if (!hasWorkspacePermission(actor.workspace.role, "MANAGE_WORKSPACE")) {
    return (
      <div className="max-w-3xl">
        <p className="text-sm text-p360-danger">
          Vous n&apos;avez pas la permission de consulter l&apos;intelligence documentaire.
        </p>
      </div>
    );
  }

  const [knowledge, memory] = await Promise.all([
    getKnowledgeDashboard(actor.workspace.id),
    getMemoryDashboard(actor.organization.id),
  ]);

  const documentStatusEntries = Object.entries(knowledge.documents.byStatus);
  const documentSourceTypeEntries = Object.entries(knowledge.documents.bySourceType);
  const indexingActionEntries = Object.entries(knowledge.indexing.byAction);
  const embeddingProviderEntries = Object.entries(knowledge.embeddings.byProvider);
  const memoryScopeEntries = Object.entries(memory.byScopeType);
  const memoryKindEntries = Object.entries(memory.byKind);

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-p360-ink">🧠 Intelligence documentaire</h1>
        <p className="mt-1 text-sm text-p360-muted">
          Memory Engine, Knowledge Engine, Context Engine et Prompt Engine : la couche que tous les agents utilisent pour
          mémoriser, indexer, rechercher et sélectionner le contexte de leurs appels IA — aucun agent ne gère son propre
          contexte.
        </p>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-p360-ink mb-3">Knowledge Engine</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatTile label="Documents" value={String(knowledge.documents.total)} />
          <StatTile label="Fragments (chunks)" value={String(knowledge.chunks.total)} />
          <StatTile
            label="Requêtes d'embedding"
            value={String(knowledge.embeddings.totalRequests)}
            sub={`${knowledge.embeddings.totalTextsEmbedded} textes vectorisés`}
          />
          <StatTile label="Coût IA (embeddings)" value={formatUsd(knowledge.embeddings.estimatedCostUsd)} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Documents par statut</CardTitle>
          </CardHeader>
          <div className="flex flex-wrap gap-2">
            {documentStatusEntries.length === 0 && <p className="text-sm text-p360-muted">Aucun document indexé.</p>}
            {documentStatusEntries.map(([status, count]) => (
              <Badge key={status} variant={status === "FAILED" ? "danger" : status === "INDEXED" ? "success" : "neutral"}>
                {status} · {count}
              </Badge>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Documents par type de source</CardTitle>
          </CardHeader>
          <div className="flex flex-wrap gap-2">
            {documentSourceTypeEntries.length === 0 && <p className="text-sm text-p360-muted">Aucun document indexé.</p>}
            {documentSourceTypeEntries.map(([sourceType, count]) => (
              <Badge key={sourceType} variant="neutral">
                {sourceType} · {count}
              </Badge>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Indexation</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <StatTile label="Temps moyen" value={formatMs(knowledge.indexing.averageDurationMs)} />
          <StatTile label="Opérations" value={String(knowledge.indexing.totalOperations)} />
          <StatTile label="Taux d'échec" value={formatPercent(knowledge.indexing.failureRate)} />
        </div>
        {indexingActionEntries.length === 0 ? (
          <p className="text-sm text-p360-muted">Aucune opération d&apos;indexation journalisée.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-p360-muted">
                <th className="py-1 pr-4">Action</th>
                <th className="py-1 pr-4">Succès</th>
                <th className="py-1 pr-4">Échecs</th>
                <th className="py-1">Total</th>
              </tr>
            </thead>
            <tbody>
              {indexingActionEntries.map(([action, counts]) => (
                <tr key={action} className="border-t border-p360-border">
                  <td className="py-1 pr-4 text-p360-ink">{action}</td>
                  <td className="py-1 pr-4">{counts.success}</td>
                  <td className="py-1 pr-4">{counts.failed}</td>
                  <td className="py-1">{counts.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Embeddings par fournisseur</CardTitle>
        </CardHeader>
        <div className="mb-4">
          <StatTile label="Taux de cache" value={formatPercent(knowledge.embeddings.cacheHitRate)} />
        </div>
        {embeddingProviderEntries.length === 0 ? (
          <p className="text-sm text-p360-muted">Aucune requête d&apos;embedding.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-p360-muted">
                <th className="py-1 pr-4">Fournisseur</th>
                <th className="py-1 pr-4">Requêtes</th>
                <th className="py-1">Servies depuis le cache</th>
              </tr>
            </thead>
            <tbody>
              {embeddingProviderEntries.map(([provider, counts]) => (
                <tr key={provider} className="border-t border-p360-border">
                  <td className="py-1 pr-4 text-p360-ink">{provider}</td>
                  <td className="py-1 pr-4">{counts.requests}</td>
                  <td className="py-1">{counts.cached}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documents les plus utilisés</CardTitle>
        </CardHeader>
        {knowledge.mostUsedDocuments.length === 0 ? (
          <p className="text-sm text-p360-muted">Aucun document consulté par une recherche pour l&apos;instant.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-p360-muted">
                <th className="py-1 pr-4">Document</th>
                <th className="py-1 pr-4">Type</th>
                <th className="py-1 pr-4">Utilisations</th>
                <th className="py-1">Dernière utilisation</th>
              </tr>
            </thead>
            <tbody>
              {knowledge.mostUsedDocuments.map((doc) => (
                <tr key={doc.id} className="border-t border-p360-border">
                  <td className="py-1 pr-4 text-p360-ink">{doc.title}</td>
                  <td className="py-1 pr-4">{doc.sourceType}</td>
                  <td className="py-1 pr-4">{doc.usageCount}</td>
                  <td className="py-1">{doc.lastUsedAt ? doc.lastUsedAt.toLocaleString("fr-FR") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Qualité des réponses</CardTitle>
        </CardHeader>
        <Badge variant="neutral">Indisponible</Badge>
        <p className="mt-2 text-sm text-p360-muted">{knowledge.responseQuality.reason}</p>
      </Card>

      <div>
        <h2 className="text-lg font-semibold text-p360-ink mb-3">Memory Engine</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <StatTile label="Entrées courantes" value={String(memory.totalCurrentEntries)} />
          <StatTile label="Archivées" value={String(memory.archivedCount)} />
          <StatTile label="En attente de nettoyage" value={String(memory.pendingCleanupCount)} />
          <StatTile label="Compressées (résumées)" value={String(memory.compressedCount)} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Par niveau</CardTitle>
            </CardHeader>
            <div className="flex flex-wrap gap-2">
              {memoryScopeEntries.length === 0 && <p className="text-sm text-p360-muted">Aucune mémoire enregistrée.</p>}
              {memoryScopeEntries.map(([scopeType, count]) => (
                <Badge key={scopeType} variant="neutral">
                  {scopeType} · {count}
                </Badge>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Par nature</CardTitle>
            </CardHeader>
            <div className="flex flex-wrap gap-2">
              {memoryKindEntries.length === 0 && <p className="text-sm text-p360-muted">Aucune mémoire enregistrée.</p>}
              {memoryKindEntries.map(([kind, count]) => (
                <Badge key={kind} variant="neutral">
                  {kind} · {count}
                </Badge>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
