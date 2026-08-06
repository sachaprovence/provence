"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";

type DemoDiscoveryResult = {
  automations: { id: string; name: string }[];
  workflow: { id: string; name: string; ran: boolean } | null;
  agent: { id: string; name: string };
  connectorsSimulated: string[];
};

/** Bouton "Découvrir Autorun" (v1.6, mission "MODE DÉMO") — provisionne en un clic un environnement complet, testable immédiatement. */
export function DiscoverAutorunButton() {
  const router = useRouter();
  const { push } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const result = await apiPost<DemoDiscoveryResult>("/api/onboarding/demo-discovery", {});
      push({
        title: "Environnement de démonstration prêt !",
        description: `${result.automations.length} automatisation(s), 1 workflow${result.workflow?.ran ? " exécuté" : ""}, 1 agent IA, ${result.connectorsSimulated.length} connecteur(s) simulé(s).`,
        variant: "success",
      });
      router.refresh();
    } catch (err) {
      push({
        title: "Provisionnement impossible",
        description: err instanceof ApiError ? err.message : "Erreur inattendue.",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={handleClick} loading={loading} variant="secondary">
      Découvrir Autorun
    </Button>
  );
}
