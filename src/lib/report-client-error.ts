/**
 * Signale une erreur capturée par une error boundary React côté navigateur
 * au serveur (journalisée par `POST /api/client-errors`). Best-effort : ne
 * doit jamais lever d'exception elle-même (on est déjà dans un état
 * d'erreur, il ne faut pas en ajouter une seconde).
 */
export function reportClientError(error: Error & { digest?: string }) {
  try {
    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        digest: error.digest,
        path: typeof window !== "undefined" ? window.location.pathname : undefined,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Ignoré volontairement : la remontée d'erreur ne doit jamais faire
    // planter l'affichage de l'écran d'erreur lui-même.
  }
}
