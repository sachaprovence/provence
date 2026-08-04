"use client";

/** Déclenche la Command Palette (voir `command-palette.tsx`) — utile pour qui ne connaît pas encore le raccourci clavier. */
export function CommandPaletteTrigger() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("command-palette:open"))}
      className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-p360-lavender-light text-sm text-p360-muted hover:bg-p360-lavender-light transition-colors"
    >
      <span>Rechercher…</span>
      <kbd className="text-xs font-mono bg-p360-lavender-light px-1.5 py-0.5 rounded">⌘K</kbd>
    </button>
  );
}
