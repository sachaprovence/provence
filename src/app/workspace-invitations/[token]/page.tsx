"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

type InvitationDetails = {
  email: string;
  workspaceName: string;
  roleLabel: string;
  requiresAccountCreation: boolean;
};

export default function WorkspaceInvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();

  const [details, setDetails] = useState<InvitationDetails | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", password: "" });

  useEffect(() => {
    apiGet<InvitationDetails>(`/api/workspace-invitations/${token}`)
      .then(setDetails)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Invitation invalide ou expirée."));
  }, [token]);

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      await apiPost(`/api/workspace-invitations/${token}`, details?.requiresAccountCreation ? form : {});
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Impossible d'accepter l'invitation.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-p360-offwhite px-4">
      <div className="w-full max-w-md card p-8">
        <div className="mb-4 text-center text-xl font-semibold text-p360-blue">Autorun</div>

        {loadError && <p className="text-center text-sm text-p360-danger">{loadError}</p>}

        {!loadError && !details && (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        )}

        {details && (
          <form onSubmit={handleAccept} className="space-y-4">
            <p className="text-center text-sm text-p360-ink">
              Vous êtes invité(e) à rejoindre le workspace <strong>{details.workspaceName}</strong> en tant que{" "}
              <strong>{details.roleLabel}</strong> ({details.email}).
            </p>

            {details.requiresAccountCreation && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Prénom"
                    required
                    value={form.firstName}
                    onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                  />
                  <Input
                    label="Nom"
                    required
                    value={form.lastName}
                    onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                  />
                </div>
                <Input
                  type="password"
                  label="Mot de passe"
                  required
                  minLength={8}
                  hint="8 caractères minimum."
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  autoComplete="new-password"
                />
              </>
            )}

            {submitError && <p className="text-sm text-p360-danger">{submitError}</p>}

            <Button type="submit" loading={submitting} className="w-full">
              {details.requiresAccountCreation ? "Créer mon compte et rejoindre" : "Rejoindre le workspace"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
