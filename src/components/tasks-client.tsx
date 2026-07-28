"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPatch, ApiError } from "@/lib/api-client";

type Task = {
  id: string;
  title: string;
  description: string | null;
  dueAt: Date | string | null;
  status: string;
  lead: { id: string; establishmentName: string } | null;
  assignee: { firstName: string; lastName: string } | null;
};

export function TasksClient({ tasks }: { tasks: Task[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(task: Task) {
    setBusy(task.id);
    setError(null);
    try {
      await apiPatch(`/api/tasks/${task.id}`, { status: task.status === "DONE" ? "OPEN" : "DONE" });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de la mise à jour de la tâche.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ul className="space-y-2">
      {error && <li className="text-sm text-p360-danger">{error}</li>}
      {tasks.map((t) => (
        <li key={t.id} className="card p-4 flex items-start gap-3">
          <input type="checkbox" className="mt-1" checked={t.status === "DONE"} disabled={busy === t.id} onChange={() => toggle(t)} />
          <div className="flex-1">
            <div className={`text-sm font-medium ${t.status === "DONE" ? "line-through text-p360-muted" : "text-p360-ink"}`}>{t.title}</div>
            {t.description && <div className="text-xs text-p360-muted mt-0.5">{t.description}</div>}
            <div className="text-xs text-p360-muted mt-1">
              {t.lead && <Link href={`/leads/${t.lead.id}`} className="text-p360-blue hover:underline">{t.lead.establishmentName}</Link>}
              {t.dueAt && <span> — échéance {new Date(t.dueAt).toLocaleDateString("fr-FR")}</span>}
              {t.assignee && <span> — {t.assignee.firstName} {t.assignee.lastName}</span>}
            </div>
          </div>
        </li>
      ))}
      {tasks.length === 0 && <p className="text-p360-muted">Aucune tâche.</p>}
    </ul>
  );
}
