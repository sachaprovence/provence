"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { NAV_ITEMS } from "@/components/nav-config";
import { apiGet } from "@/lib/api-client";
import type { MembershipRole } from "@/generated/prisma/enums";

type SearchResultItem = { id: string; label: string; subtitle?: string; href: string };
type SearchResults = {
  leads: SearchResultItem[];
  companies: SearchResultItem[];
  contacts: SearchResultItem[];
  quotes: SearchResultItem[];
  invoices: SearchResultItem[];
  virtualTours: SearchResultItem[];
};

const RESULT_GROUP_LABELS: { key: keyof SearchResults; label: string }[] = [
  { key: "leads", label: "Prospects" },
  { key: "companies", label: "Entreprises" },
  { key: "contacts", label: "Contacts" },
  { key: "quotes", label: "Devis" },
  { key: "invoices", label: "Factures" },
  { key: "virtualTours", label: "Visites 3D" },
];

/**
 * Command Palette (v1.1, AR-0182) — navigation rapide + recherche globale
 * (réutilise `AR-0181` via `/api/search`), déclenchée par `cmd+k`/`ctrl+k`
 * depuis n'importe quelle page. Nouvelle dépendance légère `cmdk` (voir
 * ADR 0043) : lib maintenue, sans dépendance transitive lourde, pattern
 * déjà standard React — la réimplémentation maison serait significativement
 * plus coûteuse pour un composant accessible au clavier comme celui-ci.
 */
export function CommandPalette({ role, navigationOverrides = {} }: { role: MembershipRole; navigationOverrides?: Record<string, boolean> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);

  const navItems = useMemo(
    () => NAV_ITEMS.filter((item) => (!item.roles || item.roles.includes(role)) && navigationOverrides[item.href] !== false),
    [role, navigationOverrides]
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    function onOpenRequest() {
      setOpen(true);
    }
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("command-palette:open", onOpenRequest);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("command-palette:open", onOpenRequest);
    };
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (query.trim().length < 2) {
        setResults(null);
        return;
      }
      apiGet<{ results: SearchResults }>(`/api/search?q=${encodeURIComponent(query)}`)
        .then(({ results }) => setResults(results))
        .catch(() => setResults(null));
    }, 200);
    return () => clearTimeout(timeout);
  }, [query]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery("");
      setResults(null);
    }
  }

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={handleOpenChange}
      label="Palette de commandes"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-24"
    >
      <div className="w-full max-w-lg rounded-xl bg-p360-surface shadow-2xl border border-p360-lavender-light overflow-hidden">
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Rechercher ou naviguer..."
          className="w-full px-4 py-3 text-sm border-b border-p360-lavender-light outline-none"
        />
        <Command.List className="max-h-96 overflow-y-auto p-2">
          <Command.Empty className="px-3 py-4 text-sm text-p360-muted">Aucun résultat.</Command.Empty>

          {results &&
            RESULT_GROUP_LABELS.map(({ key, label }) => {
              const items = results[key];
              if (items.length === 0) return null;
              return (
                <Command.Group key={key} heading={label} className="text-xs uppercase text-p360-muted px-2 pt-2">
                  {items.map((item) => (
                    <Command.Item
                      key={item.id}
                      value={`${key}-${item.id}-${item.label}`}
                      onSelect={() => go(item.href)}
                      className="flex justify-between items-center px-3 py-2 rounded-md text-sm text-p360-ink cursor-pointer data-[selected=true]:bg-p360-lavender-light"
                    >
                      <span>{item.label}</span>
                      {item.subtitle && <span className="text-xs text-p360-muted">{item.subtitle}</span>}
                    </Command.Item>
                  ))}
                </Command.Group>
              );
            })}

          {!query && (
            <Command.Group heading="Navigation" className="text-xs uppercase text-p360-muted px-2 pt-2">
              {navItems.map((item) => (
                <Command.Item
                  key={item.href}
                  value={`nav-${item.href}-${item.label}`}
                  onSelect={() => go(item.href)}
                  className="px-3 py-2 rounded-md text-sm text-p360-ink cursor-pointer data-[selected=true]:bg-p360-lavender-light"
                >
                  {item.label}
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
      </div>
    </Command.Dialog>
  );
}
