import { requireActor } from "@/lib/auth";
import { Card, CardHeader, CardTitle } from "@/components/ui";
import { ComptaBackupImportClient } from "@/components/compta-backup-import-client";

export default async function ComptaExportsPage() {
  await requireActor();
  const year = new Date().getFullYear();

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold text-p360-ink">Exports</h1>
        <p className="text-p360-muted text-sm mt-1">Format CSV compatible Excel/LibreOffice (séparateur point-virgule), PDF prêts à imprimer.</p>
      </div>

      <Card className="space-y-3">
        <CardHeader>
          <CardTitle>Exports comptables</CardTitle>
        </CardHeader>
        <div className="flex flex-wrap gap-3">
          <a href="/api/compta/exports/sales-csv" className="btn-secondary">Ventes — CSV</a>
          <a href="/api/compta/exports/expenses-csv" className="btn-secondary">Dépenses — CSV</a>
        </div>
      </Card>

      <Card className="space-y-3">
        <CardHeader>
          <CardTitle>Journaux (PDF)</CardTitle>
        </CardHeader>
        <div className="flex flex-wrap gap-3">
          <a href={`/api/compta/exports/vat-journal-pdf?year=${year}`} target="_blank" rel="noreferrer" className="btn-secondary">
            Journal TVA {year} — PDF
          </a>
          <a href="/api/compta/exports/sales-journal-pdf" target="_blank" rel="noreferrer" className="btn-secondary">
            Livre des recettes — PDF
          </a>
          <a href="/api/compta/exports/expenses-journal-pdf" target="_blank" rel="noreferrer" className="btn-secondary">
            Livre des dépenses — PDF
          </a>
        </div>
      </Card>

      <Card className="space-y-3">
        <CardHeader>
          <CardTitle>Sauvegarde de l&apos;organisation</CardTitle>
        </CardHeader>
        <p className="text-sm text-p360-muted">
          La base de données complète est déjà sauvegardée automatiquement au niveau de la plateforme.
          Cet export JSON est une copie autonome de vos données Compta Vellano, à télécharger à tout moment.
        </p>
        <div className="flex flex-wrap gap-3">
          <a href="/api/compta/backup/export" className="btn-secondary">Exporter toutes les données (JSON)</a>
        </div>
        <div className="border-t border-p360-lavender-light pt-3">
          <p className="text-sm text-p360-muted mb-2">
            Restaurer depuis une sauvegarde — <strong className="text-p360-danger">remplace intégralement</strong> les données actuelles.
          </p>
          <ComptaBackupImportClient />
        </div>
      </Card>
    </div>
  );
}
