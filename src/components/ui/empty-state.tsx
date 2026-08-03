import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

/** État vide générique (liste sans résultat, section pas encore configurée…). */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-p360-lavender-light px-6 py-12 text-center">
      <p className="font-medium text-p360-ink">{title}</p>
      {description && <p className="max-w-sm text-sm text-p360-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
