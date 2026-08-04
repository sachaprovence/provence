"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiDelete, ApiError } from "@/lib/api-client";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

interface AttachmentRow {
  id: string;
  fileName: string;
  url: string;
  category: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string | Date;
}

const CATEGORY_LABEL: Record<string, string> = {
  DOCUMENT: "Document",
  PHOTO: "Photo",
  LINK: "Lien",
};

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function isImage(mimeType: string | null): boolean {
  return Boolean(mimeType?.startsWith("image/"));
}

/**
 * Galerie de pièces jointes réutilisable (v1.1, AR-0162) — montable sur
 * n'importe quelle fiche (`Lead`, `Company`, `Property`, `VirtualTour`,
 * `Quote`, `Invoice`). Upload réel via `POST /api/attachments/upload`
 * (StorageProvider démo ou S3, voir docs/adr/0043).
 */
export function AttachmentGallery({
  entityType,
  entityId,
  attachments,
}: {
  entityType: string;
  entityId: string;
  attachments: AttachmentRow[];
}) {
  const router = useRouter();
  const [category, setCategory] = useState("DOCUMENT");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("entityType", entityType);
      formData.append("entityId", entityId);
      formData.append("category", category);

      const res = await fetch("/api/attachments/upload", { method: "POST", body: formData, credentials: "same-origin" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(data.error ?? "Échec de l'envoi.", data.details);

      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur inattendue.");
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    await apiDelete(`/api/attachments/${id}`);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents et photos ({attachments.length})</CardTitle>
      </CardHeader>
      <div className="flex items-center gap-2 mb-3">
        <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="DOCUMENT">Document</option>
          <option value="PHOTO">Photo</option>
        </select>
        <label className="btn-secondary text-xs cursor-pointer">
          {uploading ? "Envoi…" : "Ajouter un fichier"}
          <input type="file" className="hidden" disabled={uploading} onChange={handleFileChange} />
        </label>
      </div>
      {error && <p className="text-sm text-p360-danger mb-2">{error}</p>}
      <ul className="space-y-2">
        {attachments.map((attachment) => (
          <li key={attachment.id} className="flex items-center justify-between text-sm border border-p360-lavender-light rounded-lg px-3 py-2">
            <a href={attachment.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-p360-blue hover:underline">
              {isImage(attachment.mimeType) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={attachment.url} alt={attachment.fileName} className="w-8 h-8 object-cover rounded" />
              )}
              <span>
                {attachment.fileName}
                <span className="text-xs text-p360-muted ml-1">
                  ({CATEGORY_LABEL[attachment.category] ?? attachment.category}
                  {attachment.sizeBytes ? `, ${formatSize(attachment.sizeBytes)}` : ""})
                </span>
              </span>
            </a>
            <button className="text-xs text-p360-danger hover:underline" onClick={() => remove(attachment.id)}>
              Supprimer
            </button>
          </li>
        ))}
        {attachments.length === 0 && <p className="text-sm text-p360-muted">Aucun document ni photo.</p>}
      </ul>
    </Card>
  );
}
