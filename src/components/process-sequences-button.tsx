"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api-client";

export function ProcessSequencesButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setResult(null);
    try {
      const res = await apiPost<{ processed: number; succeeded: number }>("/api/cron/process-sequences");
      setResult(`${res.processed} étape(s) de séquence traitée(s) (${res.succeeded} avec succès).`);
      router.refresh();
    } catch (err) {
      setResult(err instanceof ApiError ? err.message : "Erreur lors du traitement.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button onClick={run} disabled={loading} className="btn-secondary text-sm">
        {loading ? "Traitement…" : "Traiter les relances maintenant (démo)"}
      </button>
      {result && <p className="text-xs text-p360-muted">{result}</p>}
    </div>
  );
}
