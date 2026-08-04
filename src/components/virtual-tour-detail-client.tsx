"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPut, ApiError } from "@/lib/api-client";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { AttachmentGallery } from "@/components/attachment-gallery";
import { VIRTUAL_TOUR_STATUS_LABEL, PROPERTY_TYPE_LABEL } from "@/lib/labels";
import type { getVirtualTour } from "@/lib/production/virtual-tour-service";
import type { listAttachments } from "@/lib/crm/attachment-service";

type TourDetail = Awaited<ReturnType<typeof getVirtualTour>>;

function formatDate(d: Date | string) {
  return new Date(d).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Lien Google Maps (v1.1, AR-0166) — priorité aux coordonnées GPS de la
 * visite (reprises automatiquement du bien lié à la création si non
 * saisies, voir `resolveCoordinates()`), sinon l'adresse en texte libre.
 */
function googleMapsUrl(tour: Pick<TourDetail, "latitude" | "longitude" | "address">): string | null {
  if (tour.latitude != null && tour.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${tour.latitude},${tour.longitude}`;
  }
  if (tour.address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tour.address)}`;
  return null;
}

const STATUS_ORDER = Object.keys(VIRTUAL_TOUR_STATUS_LABEL);

export function VirtualTourDetailClient({
  tour,
  attachments,
}: {
  tour: TourDetail;
  attachments: Awaited<ReturnType<typeof listAttachments>>;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    type: tour.type,
    address: tour.address,
    latitude: tour.latitude,
    longitude: tour.longitude,
    surfaceM2: tour.surfaceM2,
    scheduledAt: tour.scheduledAt ? new Date(tour.scheduledAt).toISOString().slice(0, 16) : "",
    scheduledDurationMinutes: tour.scheduledDurationMinutes,
    equipmentUsed: tour.equipmentUsed,
    matterportUrl: tour.matterportUrl,
    tourUrl: tour.tourUrl,
    notes: tour.notes,
  });
  const [status, setStatus] = useState(tour.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mapsUrl = googleMapsUrl({ latitude: form.latitude, longitude: form.longitude, address: form.address });

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await apiPut(`/api/virtual-tours/${tour.id}`, {
        type: form.type,
        address: form.address,
        latitude: form.latitude,
        longitude: form.longitude,
        surfaceM2: form.surfaceM2,
        scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
        scheduledDurationMinutes: form.scheduledDurationMinutes,
        equipmentUsed: form.equipmentUsed,
        matterportUrl: form.matterportUrl,
        tourUrl: form.tourUrl,
        notes: form.notes,
        status,
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur inattendue.");
    } finally {
      setSaving(false);
    }
  }

  const technician = tour.mission.provider;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/visits" className="text-sm text-p360-blue hover:underline">
          ← Visites 3D
        </Link>
        <h1 className="text-2xl font-semibold text-p360-ink mt-1">
          {tour.address ?? tour.mission.title}
        </h1>
        <p className="text-sm text-p360-muted mt-1">
          Client : <Link href={`/leads/${tour.leadId}`} className="text-p360-blue hover:underline">{tour.lead.establishmentName}</Link>
          {tour.property && (
            <>
              {" "}— Bien : <Link href={`/properties/${tour.property.id}`} className="text-p360-blue hover:underline">{tour.property.label}</Link>
            </>
          )}
          {" "}— créée le {formatDate(tour.createdAt)}
        </p>
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Informations</CardTitle>
          <select className="input w-56" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{VIRTUAL_TOUR_STATUS_LABEL[s]}</option>)}
          </select>
        </CardHeader>
        <div className="grid grid-cols-2 gap-3">
          <select className="input" value={form.type} onChange={(e) => update("type", e.target.value as typeof form.type)}>
            {Object.entries(PROPERTY_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input className="input" placeholder="Adresse" value={form.address ?? ""} onChange={(e) => update("address", e.target.value)} />
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
          <input
            className="input"
            type="number"
            placeholder="Surface (m²)"
            value={form.surfaceM2 ?? ""}
            onChange={(e) => update("surfaceM2", e.target.value ? Number(e.target.value) : null)}
          />
          <input
            className="input"
            type="datetime-local"
            value={form.scheduledAt}
            onChange={(e) => update("scheduledAt", e.target.value)}
          />
          <input
            className="input"
            type="number"
            min={0}
            placeholder="Durée prévue (minutes)"
            value={form.scheduledDurationMinutes ?? ""}
            onChange={(e) => update("scheduledDurationMinutes", e.target.value ? Number(e.target.value) : null)}
          />
          <input
            className="input"
            placeholder="Équipement utilisé (ex. Matterport Pro3, drone)"
            value={form.equipmentUsed ?? ""}
            onChange={(e) => update("equipmentUsed", e.target.value)}
          />
          <input className="input" placeholder="Lien Matterport" value={form.matterportUrl ?? ""} onChange={(e) => update("matterportUrl", e.target.value)} />
          <input className="input" placeholder="Lien visite" value={form.tourUrl ?? ""} onChange={(e) => update("tourUrl", e.target.value)} />
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
          <CardTitle>Technicien</CardTitle>
        </CardHeader>
        {technician ? (
          <dl className="text-sm space-y-1.5">
            <div className="flex justify-between"><dt className="text-p360-muted">Nom</dt><dd className="text-p360-ink">{technician.name}</dd></div>
            <div className="flex justify-between"><dt className="text-p360-muted">Email</dt><dd className="text-p360-ink">{technician.email}</dd></div>
            <div className="flex justify-between"><dt className="text-p360-muted">Téléphone</dt><dd className="text-p360-ink">{technician.phone ?? "—"}</dd></div>
          </dl>
        ) : (
          <p className="text-sm text-p360-muted">Aucun prestataire assigné à la mission liée.</p>
        )}
      </Card>

      <AttachmentGallery entityType="VirtualTour" entityId={tour.id} attachments={attachments} />
    </div>
  );
}
