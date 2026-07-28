"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPatch } from "@/lib/api-client";

type Appointment = {
  id: string;
  title: string;
  startAt: Date | string;
  status: string;
  location: string | null;
  summary: string | null;
  lead: { id: string; establishmentName: string };
};

const STATUS_LABEL: Record<string, string> = { SCHEDULED: "Prévu", COMPLETED: "Réalisé", CANCELLED: "Annulé", NO_SHOW: "Absence" };

export function AppointmentsClient({ appointments }: { appointments: Appointment[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [summaryDraft, setSummaryDraft] = useState<Record<string, string>>({});

  async function complete(id: string) {
    setBusy(id);
    try {
      await apiPatch(`/api/appointments/${id}`, { status: "COMPLETED", summary: summaryDraft[id] });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function cancel(id: string) {
    setBusy(id);
    try {
      await apiPatch(`/api/appointments/${id}`, { status: "CANCELLED" });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <ul className="space-y-3">
      {appointments.map((a) => (
        <li key={a.id} className="card p-4">
          <div className="flex justify-between items-start">
            <div>
              <Link href={`/leads/${a.lead.id}`} className="font-medium text-p360-blue hover:underline">{a.lead.establishmentName}</Link>
              <div className="text-sm text-p360-ink">{a.title}</div>
              <div className="text-xs text-p360-muted">{new Date(a.startAt).toLocaleString("fr-FR")} {a.location ? `— ${a.location}` : ""}</div>
            </div>
            <span className="badge bg-p360-lavender-light text-p360-blue">{STATUS_LABEL[a.status]}</span>
          </div>
          {a.status === "SCHEDULED" && (
            <div className="mt-3 flex flex-wrap gap-2 items-center">
              <input
                className="input text-sm flex-1 min-w-[200px]"
                placeholder="Compte-rendu rapide…"
                value={summaryDraft[a.id] ?? ""}
                onChange={(e) => setSummaryDraft((s) => ({ ...s, [a.id]: e.target.value }))}
              />
              <button className="btn-secondary text-xs" disabled={busy === a.id} onClick={() => complete(a.id)}>Marquer réalisé</button>
              <button className="btn-danger text-xs" disabled={busy === a.id} onClick={() => cancel(a.id)}>Annuler</button>
            </div>
          )}
          {a.summary && <p className="text-xs text-p360-muted mt-2">Compte-rendu : {a.summary}</p>}
        </li>
      ))}
      {appointments.length === 0 && <p className="text-p360-muted">Aucun rendez-vous.</p>}
    </ul>
  );
}
