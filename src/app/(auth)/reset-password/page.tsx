"use client";

import { useState } from "react";
import Link from "next/link";
import { apiPost, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast-provider";

export default function RequestResetPage() {
  const { push } = useToast();
  const [email, setEmail] = useState("");
  const [demoLink, setDemoLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiPost<{ ok: boolean; demoResetLink?: string }>("/api/auth/reset-password/request", {
        email,
      });
      setDemoLink(res.demoResetLink ?? null);
    } catch (err) {
      push({
        title: "Envoi impossible",
        description: err instanceof ApiError ? err.message : "Erreur.",
        variant: "error",
      });
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
          <Link href={demoLink} className="btn-primary inline-block">
            Réinitialiser maintenant
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="email"
            type="email"
            label="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" loading={loading} className="w-full">
            Envoyer le lien
          </Button>
        </form>
      )}
      <p className="mt-4 text-sm text-p360-muted">
        <Link href="/login" className="text-p360-blue hover:underline">
          Retour à la connexion
        </Link>
      </p>
    </>
  );
}
