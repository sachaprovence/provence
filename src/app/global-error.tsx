"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-client-error";

/**
 * Filet de sécurité ultime : capture une erreur survenue dans le root layout
 * lui-même (au-delà de ce que `error.tsx` peut intercepter). Doit définir son
 * propre `<html>`/`<body>` et ne peut pas dépendre de `globals.css` (voir
 * https://nextjs.org/docs/app/api-reference/file-conventions/error#global-error) —
 * d'où les styles en ligne plutôt que les classes Tailwind habituelles.
 */
export default function GlobalError({
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
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          fontFamily: "system-ui, sans-serif",
          color: "#24303d",
          background: "#faf8f4",
          textAlign: "center",
          padding: "1rem",
        }}
      >
        <p style={{ margin: 0, fontSize: "0.85rem", fontWeight: 600, color: "#b0413e" }}>Erreur critique</p>
        <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 600 }}>
          L&apos;application n&apos;a pas pu se charger.
        </h1>
        <p style={{ maxWidth: "28rem", fontSize: "0.9rem", color: "#6b7280" }}>
          L&apos;équipe technique a été notifiée. Rechargez la page dans un instant.
        </p>
        <button
          onClick={() => unstable_retry()}
          style={{
            marginTop: "0.5rem",
            background: "#1f3a5c",
            color: "white",
            border: "none",
            borderRadius: "0.5rem",
            padding: "0.5rem 1.25rem",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Réessayer
        </button>
      </body>
    </html>
  );
}
