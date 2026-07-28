"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api-client";

export default function ConfirmResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiPost("/api/auth/reset-password/confirm", { token, password });
      setDone(true);
      setTimeout(() => router.push("/login"), 1500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Lien invalide ou expiré.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return <p className="text-sm text-p360-success">Mot de passe mis à jour. Redirection vers la connexion…</p>;
  }

  return (
    <>
      <h1 className="text-lg font-semibold mb-6 text-p360-ink">Nouveau mot de passe</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="password">Nouveau mot de passe</label>
          <input id="password" type="password" required minLength={8} className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="text-sm text-p360-danger">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "Mise à jour…" : "Valider"}
        </button>
      </form>
    </>
  );
}
