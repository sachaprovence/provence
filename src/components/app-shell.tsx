"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Coquille d'application responsive (v1.1, AR-0185) — la barre latérale
 * fixe (256px) n'avait aucun affinement pour mobile/tablette : sur un
 * écran étroit, elle grignotait presque tout l'espace disponible sans
 * possibilité de la masquer. En dessous du point de rupture `md`, la
 * barre latérale devient un tiroir superposé (fermé par défaut, ouvert
 * par un bouton "☰" dans une barre supérieure dédiée à mobile) ; à partir
 * de `md`, elle reste statique comme avant (comportement desktop inchangé).
 */
export function AppShell({ sidebar, children }: { sidebar: React.ReactNode; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // Ferme le tiroir mobile à chaque changement de page (source externe : la navigation du
    // routeur) — évite de rester ouvert par-dessus la nouvelle page.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronise l'état du tiroir avec un changement de route externe, voir commentaire.
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-p360-lavender-light bg-p360-surface">
        <span className="text-lg font-semibold text-p360-blue">Provence 360</span>
        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          aria-label="Ouvrir le menu"
          aria-expanded={mobileOpen}
          className="btn-ghost px-2 py-1 text-xl leading-none"
        >
          {mobileOpen ? "✕" : "☰"}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/30" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}

      <aside
        className={`w-64 shrink-0 border-r border-p360-lavender-light bg-p360-surface flex flex-col fixed md:static inset-y-0 left-0 z-50 transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        {sidebar}
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">{children}</div>
      </main>
    </div>
  );
}
