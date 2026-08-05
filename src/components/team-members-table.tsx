"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch, apiDelete, apiPost, ApiError } from "@/lib/api-client";

type Member = {
  id: string;
  role: "OWNER_ADMIN" | "SALES" | "PROVIDER";
  userId: string;
  user: { firstName: string; lastName: string; email: string; isActive: boolean };
  territory: { name: string } | null;
};

const ROLE_LABEL: Record<string, string> = { OWNER_ADMIN: "Administrateur", SALES: "Commercial", PROVIDER: "Prestataire régional" };

/**
 * Gestion des membres de l'organisation (v1.4, AR-0178) — changement de
 * rôle, désactivation/réactivation, retrait définitif, transfert de
 * propriété. Auparavant seule l'invitation existait côté UI (les routes
 * PATCH/DELETE existaient déjà mais n'étaient appelées par aucun composant).
 */
export function TeamMembersTable({ members, currentUserId }: { members: Member[]; currentUserId: string }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusyId(null);
    }
  }

  function changeRole(m: Member, role: string) {
    return run(m.id, () => apiPatch(`/api/users/${m.id}`, { role }));
  }

  function toggleActive(m: Member) {
    return run(m.id, () => apiPatch(`/api/users/${m.id}`, { isActive: !m.user.isActive }));
  }

  function remove(m: Member) {
    if (!confirm(`Retirer définitivement ${m.user.firstName} ${m.user.lastName} de l'organisation ?`)) return;
    return run(m.id, () => apiDelete(`/api/users/${m.id}`));
  }

  function transferOwnership(m: Member) {
    if (!confirm(`Transférer la propriété de l'organisation à ${m.user.firstName} ${m.user.lastName} ? Vous perdrez votre rôle d'administrateur.`)) return;
    return run(m.id, () => apiPost("/api/organization/transfer-ownership", { toUserId: m.userId }));
  }

  return (
    <div className="card overflow-x-auto">
      {error && <p className="text-sm text-p360-danger px-4 pt-3">{error}</p>}
      <table className="w-full text-sm">
        <thead className="bg-p360-lavender-light/40 text-p360-muted text-xs uppercase">
          <tr>
            <th className="text-left px-4 py-2">Nom</th>
            <th className="text-left px-4 py-2">Email</th>
            <th className="text-left px-4 py-2">Rôle</th>
            <th className="text-left px-4 py-2">Territoire</th>
            <th className="text-left px-4 py-2">Statut</th>
            <th className="text-left px-4 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id} className="border-t border-p360-lavender-light">
              <td className="px-4 py-2 text-p360-ink">{m.user.firstName} {m.user.lastName}</td>
              <td className="px-4 py-2 text-p360-muted">{m.user.email}</td>
              <td className="px-4 py-2">
                <select
                  className="input text-xs"
                  value={m.role}
                  disabled={busyId === m.id || m.userId === currentUserId}
                  onChange={(e) => changeRole(m, e.target.value)}
                >
                  <option value="OWNER_ADMIN">{ROLE_LABEL.OWNER_ADMIN}</option>
                  <option value="SALES">{ROLE_LABEL.SALES}</option>
                  <option value="PROVIDER">{ROLE_LABEL.PROVIDER}</option>
                </select>
              </td>
              <td className="px-4 py-2 text-p360-muted">{m.territory?.name ?? "—"}</td>
              <td className="px-4 py-2">
                <span className={`badge ${m.user.isActive ? "bg-p360-success/10 text-p360-success" : "bg-p360-danger/10 text-p360-danger"}`}>
                  {m.user.isActive ? "Actif" : "Désactivé"}
                </span>
              </td>
              <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                {m.userId !== currentUserId && (
                  <>
                    <button className="btn-secondary text-xs" disabled={busyId === m.id} onClick={() => toggleActive(m)}>
                      {m.user.isActive ? "Désactiver" : "Réactiver"}
                    </button>
                    {m.role !== "OWNER_ADMIN" && (
                      <button className="btn-secondary text-xs" disabled={busyId === m.id} onClick={() => transferOwnership(m)}>
                        Transférer la propriété
                      </button>
                    )}
                    <button className="btn-danger text-xs" disabled={busyId === m.id} onClick={() => remove(m)}>
                      Retirer
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
