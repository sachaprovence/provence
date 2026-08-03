"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast-provider";

export default function ConfirmResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const { push } = useToast();
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiPost("/api/auth/reset-password/confirm", { token, password });
      setDone(true);
      setTimeout(() => router.push("/login"), 1500);
    } catch (err) {
      push({
        title: "Réinitialisation impossible",
        description: err instanceof ApiError ? err.message : "Lien invalide ou expiré.",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <p className="text-sm text-p360-success">Mot de passe mis à jour. Redirection vers la connexion…</p>
    );
  }

  return (
    <>
      <h1 className="text-lg font-semibold mb-6 text-p360-ink">Nouveau mot de passe</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="password"
          type="password"
          label="Nouveau mot de passe"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" loading={loading} className="w-full">
          Valider
        </Button>
      </form>
    </>
  );
}
