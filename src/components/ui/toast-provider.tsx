"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { clsx } from "clsx";

export type ToastVariant = "success" | "error" | "info";

export type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Durée d'affichage avant disparition automatique (0 = ne disparaît pas seul). */
  durationMs?: number;
};

type Toast = ToastInput & { id: string };

type ToastContextValue = {
  push: (toast: ToastInput) => void;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_CLASS: Record<ToastVariant, string> = {
  success: "border-l-4 border-p360-success",
  error: "border-l-4 border-p360-danger",
  info: "border-l-4 border-p360-blue",
};

const DEFAULT_DURATION_MS = 5000;

/**
 * Fournisseur de notifications transitoires ("toasts"), monté une seule fois
 * à la racine de l'application (`src/app/layout.tsx`). Tout composant client
 * descendant peut appeler `useToast()` pour afficher une notification, sans
 * avoir à gérer lui-même l'affichage ou la disparition automatique.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (toast: ToastInput) => {
      const id = crypto.randomUUID();
      const durationMs = toast.durationMs ?? DEFAULT_DURATION_MS;
      setToasts((current) => [...current, { ...toast, id }]);
      if (durationMs > 0) {
        setTimeout(() => dismiss(id), durationMs);
      }
    },
    [dismiss]
  );

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={clsx(
              "pointer-events-auto w-full max-w-sm rounded-lg bg-p360-surface px-4 py-3 shadow-lg",
              VARIANT_CLASS[toast.variant ?? "info"]
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-p360-ink">{toast.title}</p>
                {toast.description && <p className="mt-0.5 text-sm text-p360-muted">{toast.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Fermer la notification"
                className="text-p360-muted hover:text-p360-ink"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** À utiliser dans un composant client : `const { push } = useToast();`. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast() doit être appelé à l'intérieur d'un <ToastProvider>.");
  }
  return ctx;
}
