"use client";

import Link from "next/link";

interface PropertyRow {
  id: string;
  label: string;
  type: string;
  city: string | null;
  surfaceM2: number | null;
  lead: { id: string; establishmentName: string };
  virtualTourCount: number;
}

const TYPE_LABEL: Record<string, string> = {
  APARTMENT: "Appartement",
  HOUSE: "Maison",
  VILLA: "Villa",
  COMMERCIAL_PREMISES: "Local commercial",
  HOTEL_ROOM: "Chambre d'hôtel",
  OFFICE: "Bureau",
  LAND: "Terrain",
  OTHER: "Autre",
};

export function PropertiesClient({ properties }: { properties: PropertyRow[] }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-p360-lavender-light/40 text-p360-muted text-xs uppercase">
          <tr>
            <th className="text-left px-4 py-2">Bien</th>
            <th className="text-left px-4 py-2">Type</th>
            <th className="text-left px-4 py-2">Ville</th>
            <th className="text-left px-4 py-2">Surface</th>
            <th className="text-left px-4 py-2">Prospect/Client</th>
            <th className="text-left px-4 py-2">Visites 3D</th>
          </tr>
        </thead>
        <tbody>
          {properties.map((property) => (
            <tr key={property.id} className="border-t border-p360-lavender-light">
              <td className="px-4 py-2 text-p360-ink font-medium">{property.label}</td>
              <td className="px-4 py-2 text-p360-muted">{TYPE_LABEL[property.type] ?? property.type}</td>
              <td className="px-4 py-2 text-p360-muted">{property.city ?? "—"}</td>
              <td className="px-4 py-2 text-p360-muted">{property.surfaceM2 ? `${property.surfaceM2} m²` : "—"}</td>
              <td className="px-4 py-2">
                <Link href={`/leads/${property.lead.id}`} className="text-p360-blue hover:underline">
                  {property.lead.establishmentName}
                </Link>
              </td>
              <td className="px-4 py-2 text-p360-ink">{property.virtualTourCount}</td>
            </tr>
          ))}
          {properties.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-p360-muted">
                Aucun bien. Un bien est créé depuis la fiche d&apos;un prospect/client.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
