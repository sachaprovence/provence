"use client";

import { useState } from "react";
import { apiPut, ApiError } from "@/lib/api-client";

export type OrganizationFormData = {
  name: string;
  description: string;
  website: string;
  pitch: string;
  services: string[];
  zones: string[];
  pricingNote: string;
  portfolioLinks: string[];
  availabilityNote: string;
  tone: string;
  emailSignature: string;
  dailySendLimit: number;
  rampUpEnabled: boolean;
  requireMessageValidation: boolean;
  logoUrl: string;
  vatNumber: string;
  siret: string;
  legalAddress: string;
  phone: string;
  invoicePrefix: string;
  quotePrefix: string;
};

const DEFAULT_SERVICES = [
  "Visites virtuelles 3D et 360°",
  "Contenus immersifs Airbnb / Booking",
  "Photos professionnelles",
  "Mise en valeur numérique",
];

export function OrganizationForm({
  initial,
  onSaved,
  submitLabel = "Enregistrer",
}: {
  initial: Partial<OrganizationFormData> & { name: string };
  onSaved?: () => void;
  submitLabel?: string;
}) {
  const [form, setForm] = useState<OrganizationFormData>({
    name: initial.name,
    description: initial.description ?? "",
    website: initial.website ?? "",
    pitch: initial.pitch ?? "",
    services: initial.services?.length ? initial.services : DEFAULT_SERVICES,
    zones: initial.zones ?? [],
    pricingNote: initial.pricingNote ?? "",
    portfolioLinks: initial.portfolioLinks ?? [],
    availabilityNote: initial.availabilityNote ?? "",
    tone: initial.tone ?? "professionnel",
    emailSignature: initial.emailSignature ?? "",
    dailySendLimit: initial.dailySendLimit ?? 50,
    rampUpEnabled: initial.rampUpEnabled ?? true,
    requireMessageValidation: initial.requireMessageValidation ?? true,
    logoUrl: initial.logoUrl ?? "",
    vatNumber: initial.vatNumber ?? "",
    siret: initial.siret ?? "",
    legalAddress: initial.legalAddress ?? "",
    phone: initial.phone ?? "",
    invoicePrefix: initial.invoicePrefix ?? "FA",
    quotePrefix: initial.quotePrefix ?? "DEV",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function update<K extends keyof OrganizationFormData>(key: K, value: OrganizationFormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiPut("/api/settings/organization", form);
      setSaved(true);
      onSaved?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="label">Nom de l&apos;entreprise</label>
        <input className="input" value={form.name} onChange={(e) => update("name", e.target.value)} required />
      </div>
      <div>
        <label className="label">Description</label>
        <textarea className="input" rows={2} value={form.description} onChange={(e) => update("description", e.target.value)} />
      </div>
      <div>
        <label className="label">Site internet</label>
        <input className="input" value={form.website} onChange={(e) => update("website", e.target.value)} placeholder="https://" />
      </div>
      <div>
        <label className="label">Argumentaire commercial (pitch)</label>
        <textarea className="input" rows={2} value={form.pitch} onChange={(e) => update("pitch", e.target.value)} placeholder="Nous réalisons des visites virtuelles 360° pour valoriser votre établissement…" />
      </div>
      <div>
        <label className="label">Services proposés (une ligne par service)</label>
        <textarea
          className="input"
          rows={3}
          value={form.services.join("\n")}
          onChange={(e) => update("services", e.target.value.split("\n").filter(Boolean))}
        />
      </div>
      <div>
        <label className="label">Zones géographiques (une ligne par zone)</label>
        <textarea
          className="input"
          rows={3}
          value={form.zones.join("\n")}
          onChange={(e) => update("zones", e.target.value.split("\n").filter(Boolean))}
          placeholder="Avignon&#10;Monteux&#10;Carpentras"
        />
      </div>
      <div>
        <label className="label">Tarifs indicatifs / argumentaire prix</label>
        <textarea className="input" rows={2} value={form.pricingNote} onChange={(e) => update("pricingNote", e.target.value)} />
      </div>
      <div>
        <label className="label">Liens de réalisations (un par ligne)</label>
        <textarea
          className="input"
          rows={2}
          value={form.portfolioLinks.join("\n")}
          onChange={(e) => update("portfolioLinks", e.target.value.split("\n").filter(Boolean))}
        />
      </div>
      <div>
        <label className="label">Calendrier de disponibilités</label>
        <input className="input" value={form.availabilityNote} onChange={(e) => update("availabilityNote", e.target.value)} placeholder="Disponible du lundi au vendredi, 9h-18h" />
      </div>
      <div>
        <label className="label">Ton de communication</label>
        <select className="input" value={form.tone} onChange={(e) => update("tone", e.target.value)}>
          <option value="professionnel">Professionnel</option>
          <option value="direct_moderne">Direct et moderne</option>
          <option value="haut_de_gamme">Haut de gamme</option>
        </select>
      </div>
      <div>
        <label className="label">Signature email</label>
        <textarea className="input" rows={2} value={form.emailSignature} onChange={(e) => update("emailSignature", e.target.value)} placeholder="Jean Dupont — Provence 360" />
      </div>

      <div className="border-t border-p360-lavender-light pt-5">
        <h3 className="text-sm font-semibold text-p360-ink mb-3">Coordonnées légales, TVA et logo</h3>
        <p className="text-xs text-p360-muted mb-4">Utilisées sur les PDF de devis et de factures.</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Logo (URL de l&apos;image)</label>
            <input className="input" value={form.logoUrl} onChange={(e) => update("logoUrl", e.target.value)} placeholder="https://…/logo.png" />
          </div>
          <div>
            <label className="label">Téléphone</label>
            <input className="input" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
          </div>
          <div>
            <label className="label">N° TVA intracommunautaire</label>
            <input className="input" value={form.vatNumber} onChange={(e) => update("vatNumber", e.target.value)} placeholder="FR00000000000" />
          </div>
          <div>
            <label className="label">SIRET</label>
            <input className="input" value={form.siret} onChange={(e) => update("siret", e.target.value)} />
          </div>
          <div>
            <label className="label">Préfixe des devis</label>
            <input className="input" value={form.quotePrefix} onChange={(e) => update("quotePrefix", e.target.value)} placeholder="DEV" />
          </div>
          <div>
            <label className="label">Préfixe des factures</label>
            <input className="input" value={form.invoicePrefix} onChange={(e) => update("invoicePrefix", e.target.value)} placeholder="FA" />
          </div>
        </div>
        <div className="mt-4">
          <label className="label">Adresse légale</label>
          <textarea className="input" rows={2} value={form.legalAddress} onChange={(e) => update("legalAddress", e.target.value)} placeholder="12 rue Exemple, 84000 Avignon" />
        </div>
        {form.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- aperçu d'une URL arbitraire fournie par l'organisation, non optimisable par next/image
          <img src={form.logoUrl} alt="Aperçu du logo" className="mt-3 h-12 object-contain" />
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Limite d&apos;envoi quotidienne</label>
          <input type="number" min={1} className="input" value={form.dailySendLimit} onChange={(e) => update("dailySendLimit", Number(e.target.value))} />
        </div>
        <div className="flex items-end gap-2 pb-2">
          <input id="rampUp" type="checkbox" checked={form.rampUpEnabled} onChange={(e) => update("rampUpEnabled", e.target.checked)} />
          <label htmlFor="rampUp" className="text-sm text-p360-ink">Montée en charge progressive</label>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          id="requireValidation"
          type="checkbox"
          checked={form.requireMessageValidation}
          onChange={(e) => update("requireMessageValidation", e.target.checked)}
        />
        <label htmlFor="requireValidation" className="text-sm text-p360-ink">
          Validation humaine obligatoire avant l&apos;envoi des messages générés
        </label>
      </div>
      {error && <p className="text-sm text-p360-danger">{error}</p>}
      {saved && <p className="text-sm text-p360-success">Enregistré.</p>}
      <button type="submit" disabled={saving} className="btn-primary">
        {saving ? "Enregistrement…" : submitLabel}
      </button>
    </form>
  );
}
