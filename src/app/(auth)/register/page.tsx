"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast-provider";

export default function RegisterPage() {
  const router = useRouter();
  const { push } = useToast();
  const [form, setForm] = useState({
    organizationName: "",
    firstName: "",
    lastName: "",
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiPost("/api/auth/register", form);
      router.push("/onboarding");
      router.refresh();
    } catch (err) {
      push({
        title: "Création du compte impossible",
        description: err instanceof ApiError ? err.message : "Erreur lors de la création du compte.",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="text-lg font-semibold mb-6 text-p360-ink">Créer votre organisation</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="organizationName"
          label="Nom de l'entreprise"
          required
          value={form.organizationName}
          onChange={(e) => update("organizationName", e.target.value)}
          placeholder="Provence 360"
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            id="firstName"
            label="Prénom"
            required
            value={form.firstName}
            onChange={(e) => update("firstName", e.target.value)}
          />
          <Input
            id="lastName"
            label="Nom"
            required
            value={form.lastName}
            onChange={(e) => update("lastName", e.target.value)}
          />
        </div>
        <Input
          id="email"
          type="email"
          label="Email"
          required
          value={form.email}
          onChange={(e) => update("email", e.target.value)}
          autoComplete="email"
        />
        <Input
          id="password"
          type="password"
          label="Mot de passe"
          required
          minLength={8}
          value={form.password}
          onChange={(e) => update("password", e.target.value)}
          autoComplete="new-password"
          hint="8 caractères minimum."
        />
        <Button type="submit" loading={loading} className="w-full">
          Créer mon compte
        </Button>
      </form>
      <p className="mt-4 text-sm text-p360-muted">
        Déjà un compte ?{" "}
        <Link href="/login" className="text-p360-blue hover:underline">
          Se connecter
        </Link>
      </p>
    </>
  );
}
