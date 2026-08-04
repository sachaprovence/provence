"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPut, ApiError } from "@/lib/api-client";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

interface CompanyDetail {
  id: string;
  name: string;
  legalName: string | null;
  siret: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  country: string;
  notes: string | null;
}

interface LinkedLead {
  id: string;
  establishmentName: string;
}

interface LinkedProperty {
  id: string;
  label: string;
  city: string | null;
}

interface LinkedContact {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: string | null;
}

export function CompanyDetailClient({
  company,
  leads,
  properties,
  contacts,
}: {
  company: CompanyDetail;
  leads: LinkedLead[];
  properties: LinkedProperty[];
  contacts: LinkedContact[];
}) {
  const router = useRouter();
  const [form, setForm] = useState(company);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof CompanyDetail>(key: K, value: CompanyDetail[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await apiPut(`/api/companies/${company.id}`, {
        name: form.name,
        legalName: form.legalName,
        siret: form.siret,
        website: form.website,
        address: form.address,
        city: form.city,
        country: form.country,
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
        <Link href="/companies" className="text-sm text-p360-blue hover:underline">
          ← Entreprises
        </Link>
        <h1 className="text-2xl font-semibold text-p360-ink mt-1">{company.name}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informations</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-2 gap-3">
          <input className="input" placeholder="Nom" value={form.name} onChange={(e) => update("name", e.target.value)} />
          <input className="input" placeholder="Raison sociale" value={form.legalName ?? ""} onChange={(e) => update("legalName", e.target.value)} />
          <input className="input" placeholder="SIRET" value={form.siret ?? ""} onChange={(e) => update("siret", e.target.value)} />
          <input className="input" placeholder="Site web" value={form.website ?? ""} onChange={(e) => update("website", e.target.value)} />
          <input className="input" placeholder="Adresse" value={form.address ?? ""} onChange={(e) => update("address", e.target.value)} />
          <input className="input" placeholder="Ville" value={form.city ?? ""} onChange={(e) => update("city", e.target.value)} />
        </div>
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
          <CardTitle>Prospects / Clients liés ({leads.length})</CardTitle>
        </CardHeader>
        <ul className="space-y-1">
          {leads.map((lead) => (
            <li key={lead.id}>
              <Link href={`/leads/${lead.id}`} className="text-p360-blue hover:underline text-sm">
                {lead.establishmentName}
              </Link>
            </li>
          ))}
          {leads.length === 0 && <p className="text-sm text-p360-muted">Aucun prospect/client rattaché.</p>}
        </ul>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Biens liés ({properties.length})</CardTitle>
        </CardHeader>
        <ul className="space-y-1">
          {properties.map((property) => (
            <li key={property.id} className="text-sm text-p360-ink">
              {property.label} {property.city ? `— ${property.city}` : ""}
            </li>
          ))}
          {properties.length === 0 && <p className="text-sm text-p360-muted">Aucun bien rattaché.</p>}
        </ul>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Personnes liées ({contacts.length})</CardTitle>
        </CardHeader>
        <ul className="space-y-1">
          {contacts.map((contact) => (
            <li key={contact.id} className="text-sm text-p360-ink">
              {contact.fullName} {contact.role ? <span className="text-p360-muted">({contact.role})</span> : null}
              {contact.email && <span className="text-p360-muted"> — {contact.email}</span>}
            </li>
          ))}
          {contacts.length === 0 && <p className="text-sm text-p360-muted">Aucune personne liée.</p>}
        </ul>
      </Card>
    </div>
  );
}
