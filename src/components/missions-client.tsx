"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch, apiPost, ApiError } from "@/lib/api-client";

type Mission = {
  id: string;
  title: string;
  status: string;
  scheduledAt: Date | string | null;
  notes: string | null;
  deliverables: unknown[];
  customer: { lead: { establishmentName: string; address: string | null; city: string | null } };
  provider: { name: string } | null;
  territory: { name: string } | null;
};

const STATUS_LABEL: Record<string, string> = {
  PROPOSED: "Proposée",
  ACCEPTED: "Acceptée",
  DECLINED: "Refusée",
  IN_PROGRESS: "En cours",
  DELIVERED: "Livrée",
  CANCELLED: "Annulée",
};

export function MissionsClient({ missions, canEdit }: { missions: Mission[]; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [deliverableUrl, setDeliverableUrl] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function setStatus(id: string, status: string) {
    setBusy(id);
    setError(null);
    try {
      await apiPatch(`/api/missions/${id}`, { status });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de la mise à jour de la mission.");
    } finally {
      setBusy(null);
    }
  }

  async function addDeliverable(id: string) {
    const url = deliverableUrl[id];
    if (!url) return;
    setBusy(id);
    setError(null);
    try {
      await apiPost(`/api/missions/${id}/deliverables`, { label: "Livrable", url });
      setDeliverableUrl((s) => ({ ...s, [id]: "" }));
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur : vérifiez que l'URL du livrable est valide.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ul className="space-y-3">
      {error && <li className="text-sm text-p360-danger">{error}</li>}
      {missions.map((m) => (
        <li key={m.id} className="card p-4">
          <div className="flex justify-between items-start">
            <div>
              <div className="font-medium text-p360-ink">{m.title}</div>
              <div className="text-xs text-p360-muted">
                {m.customer.lead.city ?? m.customer.lead.address} — {m.territory?.name} {m.provider ? `— ${m.provider.name}` : "— aucun prestataire assigné"}
              </div>
            </div>
            <span className="badge bg-p360-lavender-light text-p360-blue">{STATUS_LABEL[m.status]}</span>
          </div>

          {canEdit && (
            <div className="mt-3 flex flex-wrap gap-2">
              {m.status === "PROPOSED" && (
                <>
                  <button className="btn-secondary text-xs" disabled={busy === m.id} onClick={() => setStatus(m.id, "ACCEPTED")}>Accepter</button>
                  <button className="btn-danger text-xs" disabled={busy === m.id} onClick={() => setStatus(m.id, "DECLINED")}>Refuser</button>
                </>
              )}
              {m.status === "ACCEPTED" && (
                <button className="btn-secondary text-xs" disabled={busy === m.id} onClick={() => setStatus(m.id, "IN_PROGRESS")}>Démarrer</button>
              )}
              {m.status === "IN_PROGRESS" && (
                <button className="btn-secondary text-xs" disabled={busy === m.id} onClick={() => setStatus(m.id, "DELIVERED")}>Marquer livré</button>
              )}
            </div>
          )}

          {(m.status === "IN_PROGRESS" || m.status === "DELIVERED") && canEdit && (
            <div className="mt-3 flex gap-2">
              <input
                type="url"
                className="input text-sm"
                placeholder="URL du livrable (photos, visite virtuelle…)"
                value={deliverableUrl[m.id] ?? ""}
                onChange={(e) => setDeliverableUrl((s) => ({ ...s, [m.id]: e.target.value }))}
              />
              <button className="btn-secondary text-xs shrink-0" disabled={busy === m.id} onClick={() => addDeliverable(m.id)}>Joindre</button>
            </div>
          )}

          {m.deliverables.length > 0 && (
            <div className="text-xs text-p360-muted mt-2">{m.deliverables.length} livrable(s) joint(s)</div>
          )}
        </li>
      ))}
      {missions.length === 0 && <p className="text-p360-muted">Aucune mission.</p>}
    </ul>
  );
}
