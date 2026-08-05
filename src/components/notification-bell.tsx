"use client";

import { useEffect, useRef, useState } from "react";
import { apiGet, apiPatch, apiPost } from "@/lib/api-client";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

/**
 * Bell/inbox de notifications in-app (v1.4, AR-0184) — les notifications
 * étaient déjà créées (Automation/Workflow Engine, agents) mais AUCUNE
 * interface ne permettait de les consulter : `Notification` n'avait qu'une
 * page de PRÉFÉRENCES (`/settings/notification-preferences`), jamais de
 * boîte de réception. Rafraîchit le compteur toutes les 30s (pas de canal
 * temps réel dans cette architecture) — suffisant pour une notification
 * applicative, pas un chat.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    try {
      const data = await apiGet<{ notifications: Notification[]; unreadCount: number }>("/api/notifications");
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      // Best-effort — une erreur réseau ne doit jamais casser le reste de l'interface.
    }
  }

  useEffect(() => {
    // Synchronise avec une source externe (l'API) au montage puis à intervalle régulier — pas un
    // dérivé de props/state local, donc pas de contournement possible sans effet.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- voir commentaire ci-dessus.
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function markRead(id: string) {
    await apiPatch(`/api/notifications/${id}`, {});
    await refresh();
  }

  async function markAllRead() {
    await apiPost("/api/notifications/mark-all-read");
    await refresh();
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="btn-ghost relative px-2 py-1"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-p360-danger text-white text-[10px] rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 left-0 w-80 max-h-96 overflow-y-auto card shadow-lg z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-p360-lavender-light">
            <span className="text-sm font-semibold text-p360-ink">Notifications</span>
            {unreadCount > 0 && (
              <button type="button" onClick={markAllRead} className="text-xs text-p360-blue hover:underline">
                Tout marquer comme lu
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="text-sm text-p360-muted px-3 py-4">Aucune notification.</p>
          ) : (
            <ul>
              {notifications.map((n) => (
                <li key={n.id} className={`px-3 py-2 border-b border-p360-lavender-light last:border-0 ${n.readAt ? "" : "bg-p360-lavender-light/30"}`}>
                  <a
                    href={n.link ?? "#"}
                    onClick={() => {
                      if (!n.readAt) markRead(n.id);
                      setOpen(false);
                    }}
                    className="block"
                  >
                    <div className="text-sm text-p360-ink font-medium">{n.title}</div>
                    {n.body && <div className="text-xs text-p360-muted mt-0.5">{n.body}</div>}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
