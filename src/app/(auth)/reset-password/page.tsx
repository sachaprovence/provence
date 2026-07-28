"use client";

import { useState } from "react";
import Link from "next/link";
import { apiPost, ApiError } from "@/lib/api-client";

export default function RequestResetPage() {
  const [email, setEmail] = useState("");
  const [demoLink, setDemoLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiPost<{ ok: boolean; demoResetLink?: string }>("/api/auth/reset-password/request", { email });
      setDemoLink(res.demoResetLink ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="text-lg font-semibold mb-6 text-p360-ink">Réinitialiser le mot de passe</h1>
      {demoLink ? (
        <div className="space-y-3">
          <p className="text-sm text-p360-ink">
            Mode démo : aucun email n&apos;est envoyé. Voici votre lien de réinitialisation :
          </p>
          <Link href={demoLink} className="btn-primary inline-block">Réinitialiser maintenant</Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {error && <p className="text-sm text-p360-danger">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Envoi…" : "Envoyer le lien"}
          </button>
        </form>
      )}
      <p className="mt-4 text-sm text-p360-muted">
        <Link href="/login" className="text-p360-blue hover:underline">Retour à la connexion</Link>
      </p>
    </>
  );
}
