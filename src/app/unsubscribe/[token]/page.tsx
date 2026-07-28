"use client";

import { use, useState } from "react";
import { apiPost, ApiError } from "@/lib/api-client";

export default function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);

  async function confirm() {
    setStatus("loading");
    try {
      const res = await apiPost<{ ok: boolean; establishmentName: string }>(`/api/unsubscribe/${token}`);
      setName(res.establishmentName);
      setStatus("done");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
      setStatus("error");
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-p360-offwhite px-4">
      <div className="w-full max-w-md card p-8 text-center">
        <div className="text-xl font-semibold text-p360-blue mb-4">Provence 360</div>
        {status === "done" ? (
          <p className="text-p360-ink">
            {name ? `${name} ne` : "Vous ne"} recevra plus aucun message de notre part. Vous pouvez fermer cette page.
          </p>
        ) : (
          <>
            <p className="text-p360-ink mb-6">
              Confirmez-vous ne plus vouloir être contacté(e) par Provence 360 ? Cette action est immédiate et définitive.
            </p>
            <button onClick={confirm} disabled={status === "loading"} className="btn-primary w-full">
              {status === "loading" ? "Traitement…" : "Confirmer la désinscription"}
            </button>
            {status === "error" && <p className="text-sm text-p360-danger mt-3">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
