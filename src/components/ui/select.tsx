"use client";

import { useId } from "react";
import { clsx } from "clsx";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Select({ label, error, hint, id, className, children, ...rest }: SelectProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <div>
      {label && (
        <label className="label" htmlFor={fieldId}>
          {label}
        </label>
      )}
      <select
        id={fieldId}
        className={clsx("input", error && "outline outline-2 outline-p360-danger", className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        {...rest}
      >
        {children}
      </select>
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
