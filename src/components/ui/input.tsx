"use client";

import { useId } from "react";
import { clsx } from "clsx";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

/**
 * Champ texte labellisé, cohérent avec la classe `.input` de `globals.css`.
 * Composant client (utilise `useId`) : nécessaire pour générer un
 * identifiant stable entre le rendu serveur et l'hydratation client sans
 * risque de collision entre plusieurs champs sans `id` explicite.
 */
export function Input({ label, error, hint, id, className, ...rest }: InputProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <div>
      {label && (
        <label className="label" htmlFor={fieldId}>
          {label}
        </label>
      )}
      <input
        id={fieldId}
        className={clsx("input", error && "outline outline-2 outline-p360-danger", className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        {...rest}
      />
      {error && (
        <p id={`${fieldId}-error`} className="mt-1 text-sm text-p360-danger">
          {error}
        </p>
      )}
      {!error && hint && (
        <p id={`${fieldId}-hint`} className="mt-1 text-xs text-p360-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
