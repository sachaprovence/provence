"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api-client";
import { CATEGORY_LABEL } from "@/lib/labels";

export default function NewLeadPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    establishmentName: "",
    category: "OTHER",
    city: "",
    region: "",
    websiteUrl: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    hasVirtualTour: "",
    reviewCount: "",
    averageRating: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiPost<{ lead: { id: string }; warning?: string }>("/api/leads", {
        ...form,
        hasVirtualTour: form.hasVirtualTour === "" ? undefined : form.hasVirtualTour === "true",
        reviewCount: form.reviewCount || undefined,
        averageRating: form.averageRating || undefined,
      });
      if (res.warning) setWarning(res.warning);
      router.push(`/leads/${res.lead.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de la création.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-p360-ink mb-6">Ajouter un prospect</h1>
      <form onSubmit={handleSubmit} className="card p-6 space-y-4">
        <div>
          <label className="label">Nom de l&apos;établissement *</label>
          <input required className="input" value={form.establishmentName} onChange={(e) => update("establishmentName", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Catégorie</label>
            <select className="input" value={form.category} onChange={(e) => update("category", e.target.value)}>
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Visite virtuelle existante ?</label>
            <select className="input" value={form.hasVirtualTour} onChange={(e) => update("hasVirtualTour", e.target.value)}>
              <option value="">Inconnu</option>
              <option value="true">Oui</option>
              <option value="false">Non</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Ville</label>
            <input className="input" value={form.city} onChange={(e) => update("city", e.target.value)} />
          </div>
          <div>
            <label className="label">Région</label>
            <input className="input" value={form.region} onChange={(e) => update("region", e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Site internet</label>
          <input className="input" value={form.websiteUrl} onChange={(e) => update("websiteUrl", e.target.value)} placeholder="https://" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Nombre d&apos;avis</label>
            <input type="number" className="input" value={form.reviewCount} onChange={(e) => update("reviewCount", e.target.value)} />
          </div>
          <div>
            <label className="label">Note moyenne</label>
            <input type="number" step="0.1" max={5} min={0} className="input" value={form.averageRating} onChange={(e) => update("averageRating", e.target.value)} />
          </div>
        </div>
        <div className="border-t border-p360-lavender-light pt-4">
          <div className="text-sm font-medium text-p360-ink mb-2">Contact</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Nom du contact</label>
              <input className="input" value={form.contactName} onChange={(e) => update("contactName", e.target.value)} />
            </div>
            <div>
              <label className="label">Téléphone</label>
              <input className="input" value={form.contactPhone} onChange={(e) => update("contactPhone", e.target.value)} />
            </div>
          </div>
          <div className="mt-4">
            <label className="label">Email professionnel</label>
            <input type="email" className="input" value={form.contactEmail} onChange={(e) => update("contactEmail", e.target.value)} />
          </div>
        </div>
        {warning && <p className="text-sm text-p360-warning">{warning}</p>}
        {error && <p className="text-sm text-p360-danger">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? "Création…" : "Créer le prospect"}
        </button>
      </form>
    </div>
  );
}
