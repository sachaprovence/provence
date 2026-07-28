"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api-client";

type PreviewResponse = {
  headers: string[];
  knownFields: string[];
  suggestedMapping: Record<string, string>;
  totalRows: number;
  preview: { establishmentName: string; rowErrors: string[] }[];
};

const FIELD_LABEL: Record<string, string> = {
  establishmentName: "Nom de l'établissement *",
  category: "Catégorie",
  contactName: "Nom du contact",
  contactJobTitle: "Fonction",
  contactEmail: "Email",
  contactPhone: "Téléphone",
  websiteUrl: "Site internet",
  publicListingUrl: "URL fiche publique",
  address: "Adresse",
  city: "Ville",
  region: "Région",
  country: "Pays",
  reviewCount: "Nombre d'avis",
  averageRating: "Note moyenne",
  tags: "Tags",
  notes: "Notes",
};

export default function ImportLeadsPage() {
  const router = useRouter();
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ created: number; skippedDuplicates: number; skippedSuppressed: number; rowErrors: { row: number; errors: string[] }[] } | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setFileName(file.name);
    const text = await file.text();
    setCsv(text);
    setLoading(true);
    try {
      const res = await apiPost<PreviewResponse>("/api/leads/import", { mode: "preview", csv: text });
      setPreview(res);
      setMapping(res.suggestedMapping);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur d'analyse du fichier.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCommit() {
    if (!csv) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiPost<typeof result>("/api/leads/import", { mode: "commit", csv, mapping, fileName });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'import.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-p360-ink">Importer des prospects (CSV)</h1>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- lien de téléchargement de fichier, pas une navigation de page */}
        <a href="/api/leads/csv-template" className="btn-secondary">Télécharger le modèle CSV</a>
      </div>

      {!result && (
        <div className="card p-6 space-y-4">
          <div>
            <label className="label">Fichier CSV</label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              className="block text-sm"
            />
          </div>

          {preview && (
            <>
              <p className="text-sm text-p360-muted">{preview.totalRows} ligne(s) détectée(s). Vérifiez la correspondance des colonnes :</p>
              <div className="grid grid-cols-2 gap-3">
                {preview.knownFields.map((field) => (
                  <div key={field}>
                    <label className="label">{FIELD_LABEL[field] ?? field}</label>
                    <select
                      className="input"
                      value={mapping[field] ?? ""}
                      onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value }))}
                    >
                      <option value="">— non associé —</option>
                      {preview.headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div>
                <div className="text-sm font-medium text-p360-ink mb-2">Aperçu (10 premières lignes)</div>
                <div className="overflow-x-auto border border-p360-lavender-light rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-p360-lavender-light/40">
                      <tr>
                        <th className="text-left px-3 py-1.5">Établissement</th>
                        <th className="text-left px-3 py-1.5">Erreurs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.preview.map((row, i) => (
                        <tr key={i} className="border-t border-p360-lavender-light">
                          <td className="px-3 py-1.5">{row.establishmentName || "—"}</td>
                          <td className="px-3 py-1.5 text-p360-danger">{row.rowErrors.join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {error && <p className="text-sm text-p360-danger">{error}</p>}
              <button onClick={handleCommit} disabled={loading} className="btn-primary">
                {loading ? "Import en cours…" : `Importer ${preview.totalRows} prospect(s)`}
              </button>
            </>
          )}
          {!preview && error && <p className="text-sm text-p360-danger">{error}</p>}
        </div>
      )}

      {result && (
        <div className="card p-6 space-y-3">
          <h2 className="text-lg font-semibold text-p360-ink">Import terminé</h2>
          <ul className="text-sm text-p360-ink space-y-1">
            <li>{result.created} prospect(s) créé(s)</li>
            <li>{result.skippedDuplicates} doublon(s) ignoré(s)</li>
            <li>{result.skippedSuppressed} prospect(s) créés mais bloqués (liste d&apos;exclusion)</li>
            <li>{result.rowErrors.length} ligne(s) en erreur</li>
          </ul>
          {result.rowErrors.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-p360-blue">Voir le détail des erreurs</summary>
              <ul className="mt-2 space-y-1 text-p360-danger">
                {result.rowErrors.map((e, i) => (
                  <li key={i}>Ligne {e.row} : {e.errors.join(", ")}</li>
                ))}
              </ul>
            </details>
          )}
          <button onClick={() => router.push("/leads")} className="btn-primary">Voir les prospects</button>
        </div>
      )}
    </div>
  );
}
