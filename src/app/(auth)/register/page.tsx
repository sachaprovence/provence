"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost, ApiError } from "@/lib/api-client";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ organizationName: "", firstName: "", lastName: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiPost("/api/auth/register", form);
      router.push("/onboarding");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de la création du compte.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="text-lg font-semibold mb-6 text-p360-ink">Créer votre organisation</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="organizationName">Nom de l&apos;entreprise</label>
          <input id="organizationName" required className="input" value={form.organizationName} onChange={(e) => update("organizationName", e.target.value)} placeholder="Provence 360" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="firstName">Prénom</label>
            <input id="firstName" required className="input" value={form.firstName} onChange={(e) => update("firstName", e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="lastName">Nom</label>
            <input id="lastName" required className="input" value={form.lastName} onChange={(e) => update("lastName", e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" required className="input" value={form.email} onChange={(e) => update("email", e.target.value)} autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="password">Mot de passe</label>
          <input id="password" type="password" required minLength={8} className="input" value={form.password} onChange={(e) => update("password", e.target.value)} autoComplete="new-password" />
          <p className="text-xs text-p360-muted mt-1">8 caractères minimum.</p>
        </div>
        {error && <p className="text-sm text-p360-danger">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "Création…" : "Créer mon compte"}
        </button>
      </form>
      <p className="mt-4 text-sm text-p360-muted">
        Déjà un compte ? <Link href="/login" className="text-p360-blue hover:underline">Se connecter</Link>
      </p>
    </>
  );
}
