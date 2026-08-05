"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { OrganizationForm, type OrganizationFormData } from "@/components/organization-form";
import { InviteUserForm } from "@/components/invite-user-form";
import { apiPost, ApiError } from "@/lib/api-client";

type Template = { key: string; name: string; description: string | null; category: string };
type DemoResult = { id: string; status: string; automation: { name: string } } | null;

const STEPS = [
  { key: "PROFILE", label: "Profil" },
  { key: "INVITE_TEAM", label: "Équipe" },
  { key: "CONNECT_TOOL", label: "Outils" },
  { key: "CHOOSE_TEMPLATE", label: "Modèle" },
  { key: "LAUNCH_DEMO", label: "Démonstration" },
  { key: "VIEW_RESULT", label: "Résultat" },
] as const;

/**
 * Parcours d'onboarding guidé (v1.4, AR-0178) — remplace le formulaire
 * unique (profil d'entreprise seul) par un parcours en 6 étapes, dont la
 * progression est persistée côté serveur (`OnboardingProgress`) : revenir
 * plus tard, ou être invité en cours de route par un coéquipier, reprend
 * exactement où le parcours s'était arrêté.
 */
export function OnboardingWizard({
  initialStep,
  organizationInitial,
  territories,
  templates,
  demoResult: initialDemoResult,
}: {
  initialStep: string;
  organizationInitial: Partial<OrganizationFormData> & { name: string };
  territories: { id: string; name: string }[];
  templates: Template[];
  demoResult: DemoResult;
}) {
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string | null>(null);
  const [demoResult, setDemoResult] = useState<DemoResult>(initialDemoResult);

  async function completeStep(key: string, nextKey: string) {
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/onboarding/complete-step", { step: key });
      setStep(nextKey);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  async function chooseTemplate(templateKey: string) {
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/onboarding/choose-template", { templateKey });
      setSelectedTemplateKey(templateKey);
      setStep("LAUNCH_DEMO");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  async function launchDemo() {
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/onboarding/launch-demo");
      const data = await fetch("/api/onboarding/progress", { credentials: "same-origin" }).then((r) => r.json());
      setDemoResult(data.demoResult);
      setStep("VIEW_RESULT");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  const currentIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-2 text-xs text-p360-muted">
        {STEPS.map((s, i) => (
          <span key={s.key} className={i <= currentIndex ? "text-p360-blue font-semibold" : ""}>
            {s.label}
            {i < STEPS.length - 1 && " →"}
          </span>
        ))}
      </div>

      {error && <p className="text-sm text-p360-danger">{error}</p>}

      {step === "PROFILE" && (
        <div className="card p-6">
          <h1 className="text-xl font-semibold text-p360-ink mb-1">Configurons votre entreprise</h1>
          <p className="text-p360-muted text-sm mb-4">
            Ces informations servent de base à l&apos;analyse des prospects et à la génération des messages.
          </p>
          <OrganizationForm
            initial={organizationInitial}
            submitLabel="Continuer"
            onSaved={() => completeStep("PROFILE", "INVITE_TEAM")}
          />
        </div>
      )}

      {step === "INVITE_TEAM" && (
        <div className="card p-6 space-y-4">
          <h1 className="text-xl font-semibold text-p360-ink">Invitez votre équipe</h1>
          <p className="text-p360-muted text-sm">Facultatif — vous pourrez toujours inviter des membres plus tard depuis Utilisateurs.</p>
          <InviteUserForm territories={territories} />
          <button className="btn-secondary" disabled={busy} onClick={() => completeStep("INVITE_TEAM", "CONNECT_TOOL")}>
            Continuer
          </button>
        </div>
      )}

      {step === "CONNECT_TOOL" && (
        <div className="card p-6 space-y-4">
          <h1 className="text-xl font-semibold text-p360-ink">Connectez vos premiers outils</h1>
          <p className="text-p360-muted text-sm">
            Facultatif — toutes les intégrations ont un repli en mode démo fonctionnel. Configurez-les depuis{" "}
            <Link href="/settings" className="text-p360-blue underline">
              Paramètres
            </Link>{" "}
            puis revenez ici.
          </p>
          <button className="btn-primary" disabled={busy} onClick={() => completeStep("CONNECT_TOOL", "CHOOSE_TEMPLATE")}>
            Continuer
          </button>
        </div>
      )}

      {step === "CHOOSE_TEMPLATE" && (
        <div className="card p-6 space-y-4">
          <h1 className="text-xl font-semibold text-p360-ink">Choisissez un modèle d&apos;automatisation</h1>
          <p className="text-p360-muted text-sm">Nous allons le cloner dans votre workspace et le lancer pour vous montrer un résultat concret.</p>
          <div className="grid grid-cols-1 gap-2">
            {templates.map((t) => (
              <button
                key={t.key}
                type="button"
                disabled={busy}
                onClick={() => chooseTemplate(t.key)}
                className="text-left border border-p360-lavender-light rounded-md p-3 hover:bg-p360-lavender-light/30"
              >
                <div className="font-medium text-p360-ink text-sm">{t.name}</div>
                <div className="text-xs text-p360-muted mt-0.5">{t.description}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === "LAUNCH_DEMO" && (
        <div className="card p-6 space-y-4">
          <h1 className="text-xl font-semibold text-p360-ink">Lancer la démonstration</h1>
          <p className="text-p360-muted text-sm">
            Modèle choisi : <strong>{selectedTemplateKey ?? "—"}</strong>. Nous allons le déclencher immédiatement.
          </p>
          <button className="btn-primary" disabled={busy} onClick={launchDemo}>
            {busy ? "Lancement…" : "Lancer la démonstration"}
          </button>
        </div>
      )}

      {step === "VIEW_RESULT" && (
        <div className="card p-6 space-y-4">
          <h1 className="text-xl font-semibold text-p360-ink">Premier résultat</h1>
          {demoResult ? (
            <>
              <p className="text-sm text-p360-ink">
                Automatisation <strong>{demoResult.automation.name}</strong> — statut :{" "}
                <span className={demoResult.status === "SUCCEEDED" ? "text-p360-success" : demoResult.status === "FAILED" ? "text-p360-danger" : "text-p360-muted"}>
                  {demoResult.status}
                </span>
              </p>
              <Link href={`/automations/runs/${demoResult.id}`} className="text-p360-blue underline text-sm">
                Voir le détail de l&apos;exécution
              </Link>
            </>
          ) : (
            <p className="text-sm text-p360-muted">Résultat non disponible.</p>
          )}
          <button className="btn-primary" onClick={() => router.push("/dashboard")}>
            Accéder au tableau de bord
          </button>
        </div>
      )}
    </div>
  );
}
