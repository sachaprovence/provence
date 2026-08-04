"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete } from "@/lib/api-client";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

const EVENT_TYPES = ["lead.created", "quote.signed", "invoice.paid"] as const;

interface WebhookSubscriptionPreview {
  id: string;
  url: string;
  eventTypes: string[];
  isActive: boolean;
  createdAt: string;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("fr-FR");
}

export function WebhooksClient() {
  const [subscriptions, setSubscriptions] = useState<WebhookSubscriptionPreview[]>([]);
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([...EVENT_TYPES]);
  const [creating, setCreating] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    return apiGet<{ subscriptions: WebhookSubscriptionPreview[] }>("/api/settings/webhooks").then(({ subscriptions }) =>
      setSubscriptions(subscriptions)
    );
  }

  useEffect(() => {
    load();
  }, []);

  function toggleEvent(eventType: string) {
    setSelectedEvents((prev) => (prev.includes(eventType) ? prev.filter((e) => e !== eventType) : [...prev, eventType]));
  }

  async function create() {
    setCreating(true);
    setError(null);
    try {
      const { secret } = await apiPost<{ secret: string }>("/api/settings/webhooks", { url, eventTypes: selectedEvents });
      setRevealedSecret(secret);
      setUrl("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: string) {
    await apiDelete(`/api/settings/webhooks/${id}`);
    await load();
  }

  return (
    <div className="space-y-6">
      {revealedSecret && (
        <Card className="border-p360-lavender bg-p360-lavender-light/30">
          <CardHeader>
            <CardTitle>Souscription créée — secret HMAC</CardTitle>
          </CardHeader>
          <p className="text-sm text-p360-muted mb-2">
            Copiez ce secret maintenant — utilisez-le pour vérifier l&apos;en-tête <code>X-Autorun-Signature</code>{" "}
            (HMAC-SHA256 de <code>idempotencyKey.corps</code>). Il ne sera plus jamais affiché.
          </p>
          <code className="block bg-p360-surface border border-p360-lavender rounded-lg p-3 text-sm break-all">{revealedSecret}</code>
          <button className="btn-secondary text-xs mt-3" onClick={() => setRevealedSecret(null)}>
            J&apos;ai copié le secret
          </button>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Créer une souscription</CardTitle>
        </CardHeader>
        <div className="space-y-3">
          <input className="input w-full" placeholder="https://votre-systeme.example.com/webhooks" value={url} onChange={(e) => setUrl(e.target.value)} />
          <div className="flex flex-wrap gap-3">
            {EVENT_TYPES.map((eventType) => (
              <label key={eventType} className="flex items-center gap-1.5 text-sm text-p360-ink">
                <input type="checkbox" checked={selectedEvents.includes(eventType)} onChange={() => toggleEvent(eventType)} />
                {eventType}
              </label>
            ))}
          </div>
          <button className="btn-primary" disabled={creating || !url.trim() || selectedEvents.length === 0} onClick={create}>
            {creating ? "Création…" : "Créer"}
          </button>
        </div>
        {error && <p className="text-sm text-p360-danger mt-2">{error}</p>}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Souscriptions existantes</CardTitle>
        </CardHeader>
        <ul className="space-y-2">
          {subscriptions.map((subscription) => (
            <li key={subscription.id} className="flex items-center justify-between text-sm border border-p360-lavender-light rounded-lg px-3 py-2">
              <div>
                <div className="text-p360-ink font-medium break-all">{subscription.url}</div>
                <div className="text-xs text-p360-muted">
                  {subscription.eventTypes.join(", ")} — créée le {formatDate(subscription.createdAt)}
                </div>
              </div>
              <button className="btn-secondary text-xs shrink-0 ml-2" onClick={() => remove(subscription.id)}>
                Supprimer
              </button>
            </li>
          ))}
          {subscriptions.length === 0 && <p className="text-sm text-p360-muted">Aucune souscription webhook.</p>}
        </ul>
      </Card>
    </div>
  );
}
