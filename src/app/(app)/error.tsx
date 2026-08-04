"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/report-client-error";

/**
 * Frontière d'erreur propre à l'espace applicatif authentifié : ne remplace
 * que la zone de contenu (la barre latérale, rendue par `(app)/layout.tsx`,
 * reste affichée — voir la hiérarchie décrite dans la documentation Next.js
 * de `error.js`).
 */
export default function AppSegmentError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    reportClientError(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-p360-lavender-light bg-p360-surface px-6 py-16 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-p360-danger">Erreur</p>
      <h2 className="text-lg font-semibold text-p360-ink">Cette page n&apos;a pas pu s&apos;afficher.</h2>
      <p className="max-w-md text-sm text-p360-muted">
        L&apos;équipe technique a été notifiée. Vous pouvez réessayer.
      </p>
      <Button variant="secondary" onClick={() => unstable_retry()} className="mt-2">
        Réessayer
      </Button>
    </div>
  );
}
