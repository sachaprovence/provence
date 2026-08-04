"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete } from "@/lib/api-client";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

interface ApiKeyPreview {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("fr-FR");
}

export function ApiKeysClient() {
  const [apiKeys, setApiKeys] = useState<ApiKeyPreview[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    return apiGet<{ apiKeys: ApiKeyPreview[] }>("/api/settings/api-keys").then(({ apiKeys }) => setApiKeys(apiKeys));
  }

  useEffect(() => {
    load();
  }, []);

  async function create() {
    setCreating(true);
    setError(null);
    try {
      const { rawKey } = await apiPost<{ rawKey: string }>("/api/settings/api-keys", { name });
      setRevealedKey(rawKey);
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    await apiDelete(`/api/settings/api-keys/${id}`);
    await load();
  }

  return (
    <div className="space-y-6">
      {revealedKey && (
        <Card className="border-p360-lavender bg-p360-lavender-light/30">
          <CardHeader>
            <CardTitle>Nouvelle clé API créée</CardTitle>
          </CardHeader>
          <p className="text-sm text-p360-muted mb-2">
            Copiez cette clé maintenant — elle ne sera plus jamais affichée en clair.
          </p>
          <code className="block bg-p360-surface border border-p360-lavender rounded-lg p-3 text-sm break-all">{revealedKey}</code>
          <button className="btn-secondary text-xs mt-3" onClick={() => setRevealedKey(null)}>
            J&apos;ai copié la clé
          </button>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Créer une clé API</CardTitle>
        </CardHeader>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder='Nom (ex. "Intégration comptabilité")'
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="btn-primary shrink-0" disabled={creating || !name.trim()} onClick={create}>
            {creating ? "Création…" : "Créer"}
          </button>
        </div>
        {error && <p className="text-sm text-p360-danger mt-2">{error}</p>}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clés existantes</CardTitle>
        </CardHeader>
        <ul className="space-y-2">
          {apiKeys.map((key) => (
            <li key={key.id} className="flex items-center justify-between text-sm border border-p360-lavender-light rounded-lg px-3 py-2">
              <div>
                <div className="text-p360-ink font-medium">
                  {key.name} <code className="text-xs text-p360-muted">{key.keyPrefix}…</code>
                </div>
                <div className="text-xs text-p360-muted">
                  Créée le {formatDate(key.createdAt)} — dernière utilisation : {formatDate(key.lastUsedAt)}
                  {key.revokedAt ? ` — révoquée le ${formatDate(key.revokedAt)}` : ""}
                </div>
              </div>
              {!key.revokedAt && (
                <button className="btn-secondary text-xs" onClick={() => revoke(key.id)}>
                  Révoquer
                </button>
              )}
            </li>
          ))}
          {apiKeys.length === 0 && <p className="text-sm text-p360-muted">Aucune clé API créée.</p>}
        </ul>
      </Card>
    </div>
  );
}
