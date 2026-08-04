"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost, apiPut, ApiError } from "@/lib/api-client";
import { VIRTUAL_TOUR_STATUS_LABEL, PROPERTY_TYPE_LABEL } from "@/lib/labels";

type VirtualTour = {
  id: string;
  status: string;
  type: string;
  address: string | null;
  surfaceM2: number | null;
  scheduledAt: string | Date | null;
  matterportUrl: string | null;
  tourUrl: string | null;
  lead: { id: string; establishmentName: string };
  mission: { id: string; title: string; status: string };
};

type MissionOption = { id: string; title: string; leadName: string };

const STATUS_ORDER = Object.keys(VIRTUAL_TOUR_STATUS_LABEL);

export function VirtualToursClient({ virtualTours, missions }: { virtualTours: VirtualTour[]; missions: MissionOption[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missionId, setMissionId] = useState(missions[0]?.id ?? "");
  const [type, setType] = useState("OTHER");
  const [address, setAddress] = useState("");
  const [surfaceM2, setSurfaceM2] = useState("");
  const [scheduledDurationMinutes, setScheduledDurationMinutes] = useState("");
  const [equipmentUsed, setEquipmentUsed] = useState("");
  const [matterportUrl, setMatterportUrl] = useState("");
  const [tourUrl, setTourUrl] = useState("");

  async function createTour(e: React.FormEvent) {
    e.preventDefault();
    if (!missionId) return;
    setBusy("create");
    setError(null);
    try {
      await apiPost("/api/virtual-tours", {
        missionId,
        type,
        address: address || undefined,
        surfaceM2: surfaceM2 ? Number(surfaceM2) : undefined,
        scheduledDurationMinutes: scheduledDurationMinutes ? Number(scheduledDurationMinutes) : undefined,
        equipmentUsed: equipmentUsed || undefined,
        matterportUrl: matterportUrl || undefined,
        tourUrl: tourUrl || undefined,
      });
      setAddress("");
      setSurfaceM2("");
      setScheduledDurationMinutes("");
      setEquipmentUsed("");
      setMatterportUrl("");
      setTourUrl("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(id: string, status: string) {
    setBusy(id);
    setError(null);
    try {
      await apiPut(`/api/virtual-tours/${id}`, { status });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {error && <div className="card p-3 text-sm text-p360-danger border-p360-danger">{error}</div>}

      <form onSubmit={createTour} className="card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">Mission</label>
          <select className="input" value={missionId} onChange={(e) => setMissionId(e.target.value)}>
            {missions.map((m) => (
              <option key={m.id} value={m.id}>{m.title} — {m.leadName}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Type de bien</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(PROPERTY_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Adresse</label>
          <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div>
          <label className="label">Surface (m²)</label>
          <input type="number" className="input w-24" value={surfaceM2} onChange={(e) => setSurfaceM2(e.target.value)} min={0} />
        </div>
        <div>
          <label className="label">Durée prévue (min)</label>
          <input type="number" className="input w-28" value={scheduledDurationMinutes} onChange={(e) => setScheduledDurationMinutes(e.target.value)} min={0} />
        </div>
        <div>
          <label className="label">Équipement</label>
          <input className="input" value={equipmentUsed} onChange={(e) => setEquipmentUsed(e.target.value)} placeholder="Matterport Pro3, drone…" />
        </div>
        <div>
          <label className="label">Lien Matterport</label>
          <input className="input" value={matterportUrl} onChange={(e) => setMatterportUrl(e.target.value)} placeholder="https://my.matterport.com/show/?m=..." />
        </div>
        <div>
          <label className="label">Lien visite</label>
          <input className="input" value={tourUrl} onChange={(e) => setTourUrl(e.target.value)} placeholder="https://..." />
        </div>
        <button type="submit" className="btn-primary" disabled={busy === "create" || !missionId}>Créer la visite</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-p360-lavender-light/40 text-p360-muted text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Client</th>
              <th className="text-left px-4 py-2">Type</th>
              <th className="text-left px-4 py-2">Adresse</th>
              <th className="text-left px-4 py-2">Surface</th>
              <th className="text-left px-4 py-2">Statut</th>
              <th className="text-left px-4 py-2">Liens</th>
              <th className="text-left px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {virtualTours.map((tour) => (
              <tr key={tour.id} className="border-t border-p360-lavender-light">
                <td className="px-4 py-2">
                  <Link href={`/leads/${tour.lead.id}`} className="text-p360-blue hover:underline">{tour.lead.establishmentName}</Link>
                </td>
                <td className="px-4 py-2 text-p360-ink">{PROPERTY_TYPE_LABEL[tour.type]}</td>
                <td className="px-4 py-2 text-p360-muted">{tour.address ?? "—"}</td>
                <td className="px-4 py-2 text-p360-muted">{tour.surfaceM2 ? `${tour.surfaceM2} m²` : "—"}</td>
                <td className="px-4 py-2">
                  <select
                    className="input text-xs py-1"
                    value={tour.status}
                    disabled={busy === tour.id}
                    onChange={(e) => setStatus(tour.id, e.target.value)}
                  >
                    {STATUS_ORDER.map((s) => <option key={s} value={s}>{VIRTUAL_TOUR_STATUS_LABEL[s]}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2 space-x-2">
                  {tour.matterportUrl && <a className="text-xs text-p360-blue hover:underline" href={tour.matterportUrl} target="_blank" rel="noreferrer">Matterport</a>}
                  {tour.tourUrl && <a className="text-xs text-p360-blue hover:underline" href={tour.tourUrl} target="_blank" rel="noreferrer">Visite</a>}
                </td>
                <td className="px-4 py-2">
                  <Link href={`/visits/${tour.id}`} className="text-xs text-p360-blue hover:underline">Détail</Link>
                </td>
              </tr>
            ))}
            {virtualTours.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-p360-muted">Aucune visite 3D. Créez-en une à partir d&apos;une mission existante.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
