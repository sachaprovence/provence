"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPut, ApiError } from "@/lib/api-client";

type EmailConfigPreview = {
  provider: string;
  smtpHost: string;
  smtpPort?: number;
  smtpUser: string;
  smtpSecure: boolean;
  hasSmtpPassword: boolean;
  hasApiKey: boolean;
};

const PROVIDER_OPTIONS = [
  { value: "demo", label: "Démo (aucun envoi réel)" },
  { value: "smtp", label: "SMTP" },
  { value: "resend", label: "Resend" },
  { value: "postmark", label: "Postmark" },
  { value: "brevo", label: "Brevo" },
  { value: "gmail", label: "Gmail (OAuth)" },
  { value: "outlook", label: "Outlook (OAuth)" },
];

/**
 * Réglages email (task #92, étendu v1.1 AR-0171) — le fournisseur ACTIF
 * est désormais choisi PAR ORGANISATION (`Integration.config.provider`),
 * avec repli sur la variable de déploiement `EMAIL_PROVIDER` tant
 * qu'aucun choix n'a été fait ici. Identifiants stockés par organisation
 * (`Integration.config`, voir `resolveEmailConfig`). Les champs secrets ne
 * sont JAMAIS préremplis avec la valeur enregistrée (seulement "déjà
 * enregistré ?") — un champ laissé vide au moment d'enregistrer ne
 * l'efface pas (fusion côté serveur).
 */
export function EmailSettingsForm() {
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState("demo");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpPassword, setSmtpPassword] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasSmtpPassword, setHasSmtpPassword] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiGet<{ config: EmailConfigPreview }>("/api/settings/integrations/email")
      .then(({ config }) => {
        setProvider(config.provider || "demo");
        setSmtpHost(config.smtpHost);
        setSmtpPort(config.smtpPort ? String(config.smtpPort) : "");
        setSmtpUser(config.smtpUser);
        setSmtpSecure(config.smtpSecure);
        setHasSmtpPassword(config.hasSmtpPassword);
        setHasApiKey(config.hasApiKey);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { config } = await apiPut<{ config: EmailConfigPreview }>("/api/settings/integrations/email", {
        provider,
        smtpHost,
        smtpPort: smtpPort ? Number(smtpPort) : undefined,
        smtpUser,
        smtpSecure,
        smtpPassword,
        apiKey,
      });
      setHasSmtpPassword(config.hasSmtpPassword);
      setHasApiKey(config.hasApiKey);
      setSmtpPassword("");
      setApiKey("");
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
      <div>
        <label className="label">Fournisseur actif de cette organisation</label>
        <select className="input max-w-sm" value={provider} onChange={(e) => setProvider(e.target.value)}>
          {PROVIDER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <p className="text-xs text-p360-muted mt-1">
          Prime sur la variable d&apos;environnement <code>EMAIL_PROVIDER</code> du déploiement dès qu&apos;un choix est fait ici.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Hôte SMTP</label>
          <input className="input" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.example.com" />
        </div>
        <div>
          <label className="label">Port SMTP</label>
          <input className="input" type="number" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="587" />
        </div>
        <div>
          <label className="label">Utilisateur SMTP</label>
          <input className="input" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} />
        </div>
        <div className="flex items-end gap-2 pb-2">
          <input id="smtpSecure" type="checkbox" checked={smtpSecure} onChange={(e) => setSmtpSecure(e.target.checked)} />
          <label htmlFor="smtpSecure" className="text-sm text-p360-ink">Connexion sécurisée (TLS)</label>
        </div>
        <div>
          <label className="label">Mot de passe SMTP {hasSmtpPassword && <span className="text-p360-muted">(déjà enregistré)</span>}</label>
          <input className="input" type="password" value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} placeholder={hasSmtpPassword ? "Laisser vide pour conserver" : ""} />
        </div>
        <div>
          <label className="label">Clé API (Resend/Postmark/Brevo) {hasApiKey && <span className="text-p360-muted">(déjà enregistrée)</span>}</label>
          <input className="input" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={hasApiKey ? "Laisser vide pour conserver" : ""} />
        </div>
      </div>
      {error && <p className="text-sm text-p360-danger">{error}</p>}
      {saved && <p className="text-sm text-p360-success">Enregistré.</p>}
      <button type="submit" disabled={saving} className="btn-primary">
        {saving ? "Enregistrement…" : "Enregistrer"}
      </button>
    </form>
  );
}
