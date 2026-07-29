import { clsx } from "clsx";
import { Spinner } from "@/components/ui/spinner";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  danger: "btn-danger",
  ghost: "btn-ghost",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Affiche un spinner et désactive le bouton, pour une action asynchrone en cours. */
  loading?: boolean;
}

/**
 * Bouton de base réutilisable. S'appuie sur les classes déjà définies dans
 * `globals.css` (`.btn-primary`/`.btn-secondary`/`.btn-danger`/`.btn-ghost`)
 * pour rester visuellement cohérent avec le reste de l'application.
 */
export function Button({
  variant = "primary",
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button className={clsx(VARIANT_CLASS[variant], className)} disabled={disabled || loading} {...rest}>
      {loading ? (
        <span className="inline-flex items-center justify-center gap-2">
          <Spinner size="sm" />
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
