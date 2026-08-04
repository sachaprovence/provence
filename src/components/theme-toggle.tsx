"use client";

import { useTheme } from "@/components/theme-provider";

const NEXT_THEME = { system: "light", light: "dark", dark: "system" } as const;
const THEME_ICON = { system: "🖥️", light: "☀️", dark: "🌙" } as const;
const THEME_LABEL = { system: "Système", light: "Clair", dark: "Sombre" } as const;

/** Bascule le thème (v1.1, AR-0184) — cycle Système → Clair → Sombre → Système. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={() => setTheme(NEXT_THEME[theme])}
      className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-p360-lavender-light text-sm text-p360-muted hover:bg-p360-lavender-light transition-colors"
      title="Changer de thème"
    >
      <span>Thème : {THEME_LABEL[theme]}</span>
      <span aria-hidden>{THEME_ICON[theme]}</span>
    </button>
  );
}
