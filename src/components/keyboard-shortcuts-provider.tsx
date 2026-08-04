"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MembershipRole } from "@/generated/prisma/enums";

type GoToShortcut = { key: string; href: string; label: string; roles?: MembershipRole[] };

const GO_TO_SHORTCUTS: GoToShortcut[] = [
  { key: "d", href: "/dashboard", label: "Tableau de bord" },
  { key: "l", href: "/leads", label: "Prospects", roles: ["OWNER_ADMIN", "SALES"] },
  { key: "c", href: "/companies", label: "Entreprises", roles: ["OWNER_ADMIN", "SALES"] },
  { key: "p", href: "/pipeline", label: "Pipeline", roles: ["OWNER_ADMIN", "SALES"] },
  { key: "q", href: "/quotes", label: "Devis", roles: ["OWNER_ADMIN", "SALES"] },
  { key: "i", href: "/invoices", label: "Factures", roles: ["OWNER_ADMIN", "SALES"] },
  { key: "v", href: "/visits", label: "Visites 3D" },
  { key: "w", href: "/workflows", label: "Workflows", roles: ["OWNER_ADMIN", "SALES"] },
  { key: "a", href: "/automations", label: "Automatisations", roles: ["OWNER_ADMIN", "SALES"] },
  { key: "s", href: "/settings", label: "Paramètres", roles: ["OWNER_ADMIN"] },
];

const GO_TO_PREFIX_TIMEOUT_MS = 1200;

function isTypingContext(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/**
 * Raccourcis clavier globaux (v1.1, AR-0185) — `g` puis une lettre pour
 * naviguer (façon Gmail/Linear), `n` pour "nouveau prospect", `?` pour
 * l'aide clavier. `cmd+k`/`ctrl+k` (palette de commandes, AR-0182) est géré
 * séparément par `command-palette.tsx`, documenté ici uniquement dans
 * l'aide. Jamais actif quand le focus est dans un champ de saisie.
 */
export function KeyboardShortcutsProvider({ role, children }: { role: MembershipRole; children: React.ReactNode }) {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);
  const goToPendingRef = useRef(false);
  const goToTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const availableGoTo = GO_TO_SHORTCUTS.filter((s) => !s.roles || s.roles.includes(role));

  useEffect(() => {
    function clearGoToPending() {
      goToPendingRef.current = false;
      if (goToTimeoutRef.current) {
        clearTimeout(goToTimeoutRef.current);
        goToTimeoutRef.current = null;
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingContext(e.target)) return;

      if (goToPendingRef.current) {
        const shortcut = availableGoTo.find((s) => s.key === e.key.toLowerCase());
        clearGoToPending();
        if (shortcut) {
          e.preventDefault();
          router.push(shortcut.href);
        }
        return;
      }

      if (e.key === "g") {
        goToPendingRef.current = true;
        goToTimeoutRef.current = setTimeout(clearGoToPending, GO_TO_PREFIX_TIMEOUT_MS);
        return;
      }

      if (e.key === "n") {
        e.preventDefault();
        router.push("/leads/new");
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen((prev) => !prev);
        return;
      }

      if (e.key === "Escape") {
        setHelpOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      clearGoToPending();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `availableGoTo` est dérivé de `role`, stable pour la durée de vie du composant (le rôle d'un utilisateur ne change jamais en cours de session).
  }, [router]);

  return (
    <>
      {children}
      {helpOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-24" onClick={() => setHelpOpen(false)}>
          <div
            className="w-full max-w-md rounded-xl bg-p360-surface shadow-2xl border border-p360-lavender-light overflow-hidden p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-p360-ink mb-3">Raccourcis clavier</h2>
            <ul className="space-y-1.5 text-sm">
              <li className="flex justify-between"><span className="text-p360-ink">Palette de commandes</span><kbd className="badge bg-p360-lavender-light">⌘K</kbd></li>
              <li className="flex justify-between"><span className="text-p360-ink">Nouveau prospect</span><kbd className="badge bg-p360-lavender-light">N</kbd></li>
              <li className="flex justify-between"><span className="text-p360-ink">Cette aide</span><kbd className="badge bg-p360-lavender-light">?</kbd></li>
              {availableGoTo.map((s) => (
                <li key={s.key} className="flex justify-between">
                  <span className="text-p360-ink">Aller à : {s.label}</span>
                  <kbd className="badge bg-p360-lavender-light">G puis {s.key.toUpperCase()}</kbd>
                </li>
              ))}
            </ul>
            <p className="text-xs text-p360-muted mt-3">Inactifs pendant la saisie dans un champ. Échap pour fermer.</p>
          </div>
        </div>
      )}
    </>
  );
}
