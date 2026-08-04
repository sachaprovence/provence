"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPut, ApiError } from "@/lib/api-client";

type ChannelConfigPreview = {
  provider: string | null;
  configuredKeys: string[];
};

const CHANNELS = [
  { key: "SMS", label: "SMS", fromNumberLabel: "Numéro d'envoi SMS" },
  { key: "WHATSAPP", label: "WhatsApp", fromNumberLabel: "Numéro WhatsApp Business" },
  { key: "PHONE", label: "Téléphone (appel sortant)", fromNumberLabel: "Numéro d'appel sortant" },
] as const;

/**
 * Réglages SMS/WhatsApp/Téléphone (v1.1, AR-0170/AR-0171) — Twilio couvre
 * les trois canaux avec UN SEUL compte (accountSid/authToken partagés,
 * voir ADR 0043), mais chaque canal a son propre numéro d'envoi et son
 * propre choix de fournisseur par organisation
 * (`Integration.config.provider`, déjà résolu par
 * `hub-service.ts#resolveChannelProvider`).
 */
export function CommunicationSettingsForm() {
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<Record<string, string>>({ SMS: "demo", WHATSAPP: "demo", PHONE: "demo" });
  const [accountSid, setAccountSid] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [fromNumbers, setFromNumbers] = useState<Record<string, string>>({ SMS: "", WHATSAPP: "", PHONE: "" });
  const [hasAuthToken, setHasAuthToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all(CHANNELS.map((c) => apiGet<{ config: ChannelConfigPreview }>(`/api/communications/config/${c.key}`)))
      .then((results) => {
        setProviders((prev) => {
          const next = { ...prev };
          results.forEach((r, i) => (next[CHANNELS[i].key] = r.config.provider || "demo"));
          return next;
        });
        setHasAuthToken(results.some((r) => r.config.configuredKeys.includes("authToken")));
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      for (const c of CHANNELS) {
        await apiPut(`/api/communications/config/${c.key}`, {
          provider: providers[c.key],
          config: {
            accountSid: accountSid || undefined,
            authToken: authToken || undefined,
            fromNumber: fromNumbers[c.key] || undefined,
          },
        });
      }
      setAuthToken("");
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-p360-muted">Chargement…</p>;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Account SID Twilio</label>
          <input className="input" value={accountSid} onChange={(e) => setAccountSid(e.target.value)} placeholder="AC..." />
        </div>
        <div>
          <label className="label">Auth Token Twilio {hasAuthToken && <span className="text-p360-muted">(déjà enregistré)</span>}</label>
          <input
            className="input"
            type="password"
            value={authToken}
            onChange={(e) => setAuthToken(e.target.value)}
            placeholder={hasAuthToken ? "Laisser vide pour conserver" : ""}
          />
        </div>
      </div>
      <div className="space-y-3">
        {CHANNELS.map((c) => (
          <div key={c.key} className="grid grid-cols-3 gap-4 items-end border-t border-p360-lavender-light pt-3">
            <div>
              <label className="label">{c.label}</label>
              <select className="input" value={providers[c.key]} onChange={(e) => setProviders((p) => ({ ...p, [c.key]: e.target.value }))}>
                <option value="demo">Démo (aucun envoi réel)</option>
                <option value="twilio">Twilio</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">{c.fromNumberLabel}</label>
              <input
                className="input"
                value={fromNumbers[c.key]}
                onChange={(e) => setFromNumbers((f) => ({ ...f, [c.key]: e.target.value }))}
                placeholder="+33..."
              />
            </div>
          </div>
        ))}
      </div>
      {error && <p className="text-sm text-p360-danger">{error}</p>}
      {saved && <p className="text-sm text-p360-success">Enregistré.</p>}
      <button type="submit" disabled={saving} className="btn-primary">
        {saving ? "Enregistrement…" : "Enregistrer"}
      </button>
    </form>
  );
}
