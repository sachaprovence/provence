"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";
type ThemeContextValue = { theme: Theme; resolvedTheme: "light" | "dark"; setTheme: (theme: Theme) => void };

const THEME_STORAGE_KEY = "theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Mode sombre (v1.1, AR-0184) — préférence système par défaut, bascule
 * manuelle persistée en localStorage. Applique l'attribut `data-theme` sur
 * `<html>`, lu par `globals.css` (`:root[data-theme="dark"]`) — jamais de
 * couleur en dur dans les composants, qui consomment déjà les variables
 * CSS existantes. Un script bloquant dans `layout.tsx` pose déjà cet
 * attribut avant l'hydratation (évite le flash de mauvais thème sur
 * `<html>`, avec `suppressHydrationWarning` dédié à cet unique attribut).
 *
 * `theme` démarre TOUJOURS à "system" ici, y compris côté client au tout
 * premier rendu (jamais lu depuis `localStorage` pendant le rendu lui-même)
 * — le rendu serveur ne peut pas connaître la préférence stockée, donc lire
 * `localStorage` dans l'initialiseur de `useState` désynchroniserait le
 * texte hydraté (ex. le libellé du bouton `ThemeToggle`) de celui rendu par
 * le serveur. La vraie valeur n'est appliquée qu'après montage, dans un
 * effet dédié à la synchronisation avec `localStorage` (source externe).
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronisation unique avec localStorage après montage (impossible à lire côté serveur, voir commentaire ci-dessus).
      setThemeState(stored);
    }
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    function apply() {
      const resolved = theme === "system" ? (mediaQuery.matches ? "dark" : "light") : theme;
      setResolvedTheme(resolved);
      if (theme === "system") document.documentElement.removeAttribute("data-theme");
      else document.documentElement.setAttribute("data-theme", theme);
    }

    apply();
    mediaQuery.addEventListener("change", apply);
    return () => mediaQuery.removeEventListener("change", apply);
  }, [theme]);

  function setTheme(next: Theme) {
    setThemeState(next);
    if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, next);
  }

  return <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme doit être utilisé à l'intérieur de <ThemeProvider>.");
  return ctx;
}
