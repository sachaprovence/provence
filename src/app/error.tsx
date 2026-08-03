"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/report-client-error";

export default function RootError({
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
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-p360-danger">Erreur</p>
      <h1 className="text-2xl font-semibold text-p360-ink">Une erreur est survenue.</h1>
      <p className="max-w-md text-sm text-p360-muted">
        L&apos;équipe technique a été notifiée. Vous pouvez réessayer ou revenir au tableau de bord.
      </p>
      <div className="mt-2 flex gap-3">
        <Button variant="secondary" onClick={() => unstable_retry()}>
          Réessayer
        </Button>
        <a href="/dashboard">
          <Button variant="primary">Tableau de bord</Button>
        </a>
      </div>
    </div>
  );
}
