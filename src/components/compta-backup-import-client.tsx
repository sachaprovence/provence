"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api-client";

export function ComptaBackupImportClient() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleFile(file: File) {
    if (
      !confirm(
        "Attention : cette opération REMPLACE INTÉGRALEMENT toutes les données Compta Vellano de cette organisation par le contenu du fichier. Cette action est irréversible. Continuer ?"
      )
    ) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(false);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      await apiPost("/api/compta/backup/import", payload);
      setSuccess(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Fichier invalide ou erreur lors de la restauration.");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
        className="text-sm"
      />
      {busy && <p className="text-sm text-p360-muted">Restauration en cours…</p>}
      {error && <p className="text-sm text-p360-danger">{error}</p>}
      {success && <p className="text-sm text-p360-success">Données restaurées avec succès.</p>}
    </div>
  );
}
