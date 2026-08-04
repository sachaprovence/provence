"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost, ApiError } from "@/lib/api-client";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

interface CompanyRow {
  id: string;
  name: string;
  legalName: string | null;
  city: string | null;
  leadCount: number;
  propertyCount: number;
}

export function CompaniesClient({ companies }: { companies: CompanyRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setCreating(true);
    setError(null);
    try {
      await apiPost("/api/companies", { name });
      setName("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur inattendue.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Créer une entreprise</CardTitle>
        </CardHeader>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder='Nom (ex. "Groupe Hôtelier Méditerranée")'
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="btn-primary shrink-0" disabled={creating || !name.trim()} onClick={create}>
            {creating ? "Création…" : "Créer"}
          </button>
        </div>
        {error && <p className="text-sm text-p360-danger mt-2">{error}</p>}
      </Card>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-p360-lavender-light/40 text-p360-muted text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Nom</th>
              <th className="text-left px-4 py-2">Ville</th>
              <th className="text-left px-4 py-2">Prospects/Clients</th>
              <th className="text-left px-4 py-2">Biens</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => (
              <tr key={company.id} className="border-t border-p360-lavender-light">
                <td className="px-4 py-2">
                  <Link href={`/companies/${company.id}`} className="text-p360-blue hover:underline font-medium">
                    {company.name}
                  </Link>
                  {company.legalName && <div className="text-xs text-p360-muted">{company.legalName}</div>}
                </td>
                <td className="px-4 py-2 text-p360-muted">{company.city ?? "—"}</td>
                <td className="px-4 py-2 text-p360-ink">{company.leadCount}</td>
                <td className="px-4 py-2 text-p360-ink">{company.propertyCount}</td>
              </tr>
            ))}
            {companies.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-p360-muted">
                  Aucune entreprise. Regroupez plusieurs prospects/clients sous une même entité juridique pour les gérer ensemble.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
