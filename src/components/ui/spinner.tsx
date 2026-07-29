import { clsx } from "clsx";

const SIZE_CLASS = {
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-9 w-9 border-[3px]",
};

export interface SpinnerProps {
  size?: keyof typeof SIZE_CLASS;
  className?: string;
  /** Texte annoncé aux lecteurs d'écran (le spinner lui-même est décoratif). */
  label?: string;
}

export function Spinner({ size = "md", className, label = "Chargement…" }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={clsx(
        "inline-block animate-spin rounded-full border-current border-t-transparent text-current opacity-80",
        SIZE_CLASS[size],
        className
      )}
    />
  );
}
