"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, apiDelete, ApiError } from "@/lib/api-client";
import type { TagModel } from "@/generated/prisma/models";

/**
 * Gestionnaire de tags (v1.1, AR-0163) — création/suppression, réutilisé
 * partout où des tags doivent être gérés (liste des prospects pour
 * l'instant ; fiche 360° en AR-0164 pour l'assignation par fiche).
 */
type Props = {
  tags: TagModel[];
};

const DEFAULT_COLOR = "#6b7280";

export function TagManager({ tags }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy("create");
    setError(null);
    try {
      await apiPost("/api/tags", { name: name.trim(), color });
      setName("");
      setColor(DEFAULT_COLOR);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Supprimer ce tag ? Il sera retiré de tous les prospects.")) return;
    setBusy(id);
    setError(null);
    try {
      await apiDelete(`/api/tags/${id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card p-4">
      <button type="button" className="text-sm font-semibold text-p360-ink flex items-center gap-2" onClick={() => setOpen((v) => !v)}>
        Tags {open ? "▾" : "▸"}
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <form onSubmit={create} className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="label">Nom</label>
              <input className="input w-40" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. VIP" />
            </div>
            <div>
              <label className="label">Couleur</label>
              <input type="color" className="h-9 w-14 rounded border border-p360-lavender-light" value={color} onChange={(e) => setColor(e.target.value)} />
            </div>
            <button type="submit" className="btn-secondary" disabled={busy === "create" || !name.trim()}>
              {busy === "create" ? "Création…" : "Créer un tag"}
            </button>
          </form>
          {error && <p className="text-sm text-p360-danger">{error}</p>}
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span key={tag.id} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-white" style={{ backgroundColor: tag.color }}>
                {tag.name}
                <button
                  type="button"
                  className="opacity-80 hover:opacity-100"
                  disabled={busy === tag.id}
                  onClick={() => remove(tag.id)}
                  aria-label={`Supprimer le tag ${tag.name}`}
                >
                  ×
                </button>
              </span>
            ))}
            {tags.length === 0 && <p className="text-sm text-p360-muted">Aucun tag. Créez-en un ci-dessus.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export function TagBadge({ tag }: { tag: Pick<TagModel, "id" | "name" | "color"> }) {
  return (
    <span key={tag.id} className="inline-flex items-center rounded-full px-2 py-0.5 text-xs text-white" style={{ backgroundColor: tag.color }}>
      {tag.name}
    </span>
  );
}
