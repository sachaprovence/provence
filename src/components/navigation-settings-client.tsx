"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPatch, apiPost, ApiError } from "@/lib/api-client";
import { NAV_ITEMS } from "@/components/nav-config";
import type { MembershipRole } from "@/generated/prisma/enums";

type Member = { userId: string; name: string; role: MembershipRole; roleLabel: string };

const PRESETS: { key: "service_pizzeria" | "gestion_complete"; label: string; description: string }[] = [
  { key: "service_pizzeria", label: "Service pizzeria", description: "Tableau de bord, Commandes, Ventes, Stock, Caisse — le strict nécessaire pour le comptoir." },
  { key: "gestion_complete", label: "Gestion complète", description: "Toutes les sections accessibles au rôle de ce compte." },
];

export function NavigationSettingsClient({ currentUserId, members }: { currentUserId: string; members: Member[] }) {
  const router = useRouter();
  const [selectedUserId, setSelectedUserId] = useState(currentUserId);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [applyingPreset, setApplyingPreset] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = loadedUserId !== selectedUserId || applyingPreset;

  const selectedMember = members.find((m) => m.userId === selectedUserId);

  const visibleItems = useMemo(
    () => NAV_ITEMS.filter((item) => !item.roles || (selectedMember && item.roles.includes(selectedMember.role))),
    [selectedMember]
  );

  useEffect(() => {
    let cancelled = false;
    apiGet<{ overrides: Record<string, boolean> }>(`/api/settings/navigation?userId=${selectedUserId}`)
      .then((res) => {
        if (!cancelled) setOverrides(res.overrides);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Impossible de charger les préférences.");
      })
      .finally(() => {
        if (!cancelled) setLoadedUserId(selectedUserId);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedUserId]);

  async function toggle(sectionKey: string, visible: boolean) {
    setBusyKey(sectionKey);
    setError(null);
    try {
      const res = await apiPatch<{ overrides: Record<string, boolean> }>("/api/settings/navigation", {
        userId: selectedUserId,
        items: [{ sectionKey, visible }],
      });
      setOverrides(res.overrides);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'enregistrer ce réglage.");
    } finally {
      setBusyKey(null);
    }
  }

  async function applyPreset(preset: "service_pizzeria" | "gestion_complete") {
    setApplyingPreset(true);
    setError(null);
    try {
      const res = await apiPost<{ overrides: Record<string, boolean> }>("/api/settings/navigation/preset", {
        userId: selectedUserId,
        preset,
      });
      setOverrides(res.overrides);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'appliquer ce préréglage.");
    } finally {
      setApplyingPreset(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <label className="label">Compte</label>
        <select className="input" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name} {m.userId === currentUserId ? "(vous)" : ""} — {m.roleLabel}
            </option>
          ))}
        </select>
      </div>

      <div className="card p-4 space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-p360-muted">Préréglages</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          {PRESETS.map((preset) => (
            <button key={preset.key} type="button" disabled={loading} className="btn-secondary flex-1 text-left" onClick={() => applyPreset(preset.key)} title={preset.description}>
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-p360-danger">{error}</p>}

      <div className="card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-p360-muted mb-3">Sections visibles</h2>
        {loading ? (
          <p className="text-sm text-p360-muted">Chargement…</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
            {visibleItems.map((item) => {
              const visible = overrides[item.href] ?? true;
              return (
                <label key={item.href} className="flex items-center gap-2 py-1.5 text-sm text-p360-ink">
                  <input
                    type="checkbox"
                    checked={visible}
                    disabled={busyKey === item.href}
                    onChange={(e) => toggle(item.href, e.target.checked)}
                  />
                  {item.label}
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
