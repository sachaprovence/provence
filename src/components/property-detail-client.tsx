"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPut, ApiError } from "@/lib/api-client";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

interface PropertyDetail {
  id: string;
  label: string;
  type: string;
  address: string | null;
  city: string | null;
  region: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  surfaceM2: number | null;
  notes: string | null;
}

const TYPE_OPTIONS = [
  { value: "APARTMENT", label: "Appartement" },
  { value: "HOUSE", label: "Maison" },
  { value: "VILLA", label: "Villa" },
  { value: "COMMERCIAL_PREMISES", label: "Local commercial" },
  { value: "HOTEL_ROOM", label: "Chambre d'hôtel" },
  { value: "OFFICE", label: "Bureau" },
  { value: "LAND", label: "Terrain" },
  { value: "OTHER", label: "Autre" },
];

function googleMapsUrl(property: PropertyDetail): string | null {
  if (property.latitude != null && property.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${property.latitude},${property.longitude}`;
  }
  const parts = [property.address, property.city, property.country].filter(Boolean);
  if (parts.length === 0) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(", "))}`;
}

export function PropertyDetailClient({
  property,
  lead,
  company,
  virtualTours,
}: {
  property: PropertyDetail;
  lead: { id: string; establishmentName: string };
  company: { id: string; name: string } | null;
  virtualTours: { id: string; status: string; matterportUrl: string | null }[];
}) {
  const router = useRouter();
  const [form, setForm] = useState(property);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mapsUrl = googleMapsUrl(property);

  function update<K extends keyof PropertyDetail>(key: K, value: PropertyDetail[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await apiPut(`/api/properties/${property.id}`, {
        label: form.label,
        type: form.type,
        address: form.address,
        city: form.city,
        region: form.region,
        country: form.country,
        latitude: form.latitude,
        longitude: form.longitude,
        surfaceM2: form.surfaceM2,
        notes: form.notes,
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur inattendue.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/properties" className="text-sm text-p360-blue hover:underline">
          ← Biens
        </Link>
        <h1 className="text-2xl font-semibold text-p360-ink mt-1">{property.label}</h1>
        <p className="text-sm text-p360-muted mt-1">
          Prospect/client : <Link href={`/leads/${lead.id}`} className="text-p360-blue hover:underline">{lead.establishmentName}</Link>
          {company && (
            <>
              {" "}— Entreprise : <Link href={`/companies/${company.id}`} className="text-p360-blue hover:underline">{company.name}</Link>
            </>
          )}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informations</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-2 gap-3">
          <input className="input" placeholder="Nom du bien" value={form.label} onChange={(e) => update("label", e.target.value)} />
          <select className="input" value={form.type} onChange={(e) => update("type", e.target.value)}>
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <input className="input" placeholder="Adresse" value={form.address ?? ""} onChange={(e) => update("address", e.target.value)} />
          <input className="input" placeholder="Ville" value={form.city ?? ""} onChange={(e) => update("city", e.target.value)} />
          <input className="input" placeholder="Région" value={form.region ?? ""} onChange={(e) => update("region", e.target.value)} />
          <input
            className="input"
            type="number"
            placeholder="Surface (m²)"
            value={form.surfaceM2 ?? ""}
            onChange={(e) => update("surfaceM2", e.target.value ? Number(e.target.value) : null)}
          />
          <input
            className="input"
            type="number"
            step="any"
            placeholder="Latitude"
            value={form.latitude ?? ""}
            onChange={(e) => update("latitude", e.target.value ? Number(e.target.value) : null)}
          />
          <input
            className="input"
            type="number"
            step="any"
            placeholder="Longitude"
            value={form.longitude ?? ""}
            onChange={(e) => update("longitude", e.target.value ? Number(e.target.value) : null)}
          />
        </div>
        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noreferrer" className="text-sm text-p360-blue hover:underline mt-2 inline-block">
            Voir sur Google Maps
          </a>
        )}
        <textarea
          className="input mt-3 w-full"
          rows={3}
          placeholder="Notes"
          value={form.notes ?? ""}
          onChange={(e) => update("notes", e.target.value)}
        />
        <button className="btn-primary mt-3" disabled={saving} onClick={save}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
        {error && <p className="text-sm text-p360-danger mt-2">{error}</p>}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Visites 3D ({virtualTours.length})</CardTitle>
        </CardHeader>
        <ul className="space-y-1">
          {virtualTours.map((vt) => (
            <li key={vt.id} className="text-sm text-p360-ink flex items-center gap-2">
              <span className="badge bg-p360-lavender-light text-p360-blue">{vt.status}</span>
              {vt.matterportUrl && (
                <a href={vt.matterportUrl} target="_blank" rel="noreferrer" className="text-p360-blue hover:underline">
                  Voir la visite
                </a>
              )}
            </li>
          ))}
          {virtualTours.length === 0 && <p className="text-sm text-p360-muted">Aucune visite 3D pour ce bien.</p>}
        </ul>
      </Card>
    </div>
  );
}
