"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { apiPost, apiPut, apiPatch, ApiError } from "@/lib/api-client";
import type { LeadDetail } from "@/app/(app)/leads/[id]/page";
import { STAGE_LABEL, CATEGORY_LABEL, STAGE_BADGE_CLASS, PIPELINE_STAGES, MESSAGE_TYPE_LABEL, INTENT_LABEL } from "@/lib/labels";
import { ScoreBadge } from "@/components/score-badge";
import type { SequenceModel, SequenceStepModel, ServiceModel } from "@/generated/prisma/models";

type Props = {
  lead: LeadDetail;
  sequences: (SequenceModel & { steps: SequenceStepModel[] })[];
  services: ServiceModel[];
  canValidate: boolean;
};

function formatDate(d: Date | string) {
  return new Date(d).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}
function formatEuros(cents: number) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

export function LeadDetailClient({ lead, sequences, services, canValidate }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const analysis = lead.analyses[0];
  const score = lead.scores[0];
  const primaryContact = lead.contacts[0];

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6 pb-16">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-p360-ink">{lead.establishmentName}</h1>
            {lead.isSuppressed && <span className="badge bg-red-50 text-p360-danger">désinscrit / exclu</span>}
          </div>
          <p className="text-p360-muted text-sm mt-1">
            {CATEGORY_LABEL[lead.category]} {lead.city ? `— ${lead.city}` : ""} {lead.region ? `(${lead.region})` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <select
            className="input w-56"
            value={lead.stage}
            disabled={busy === "stage"}
            onChange={(e) => run("stage", () => apiPut(`/api/leads/${lead.id}`, { stage: e.target.value }))}
          >
            {PIPELINE_STAGES.map((s) => (
              <option key={s} value={s}>{STAGE_LABEL[s]}</option>
            ))}
          </select>
          <ScoreBadge value={score?.value} />
        </div>
      </div>

      {error && <div className="card p-3 text-sm text-p360-danger border-p360-danger">{error}</div>}

      <div className="flex flex-wrap gap-3">
        <button className="btn-secondary" disabled={busy === "analyze"} onClick={() => run("analyze", () => apiPost(`/api/leads/${lead.id}/analyze`))}>
          {busy === "analyze" ? "Analyse en cours…" : "Analyser (IA)"}
        </button>
        <button className="btn-secondary" disabled={busy === "score"} onClick={() => run("score", () => apiPost(`/api/leads/${lead.id}/score`))}>
          {busy === "score" ? "Calcul…" : "Calculer le score"}
        </button>
        {!lead.isSuppressed && (
          <button
            className="btn-danger"
            disabled={busy === "suppress"}
            onClick={() => {
              if (confirm("Confirmer l'ajout à la liste d'exclusion ? Ce prospect ne pourra plus être contacté.")) {
                run("suppress", () => apiPost(`/api/leads/${lead.id}/suppress`));
              }
            }}
          >
            Ajouter à la liste d&apos;exclusion
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <AnalysisPanel analysis={analysis} />
          <MessagesPanel lead={lead} canValidate={canValidate} />
          <SequencePanel lead={lead} sequences={sequences} />
          <InboxPanel lead={lead} />
          <AppointmentsPanel lead={lead} />
          <OpportunitiesPanel lead={lead} services={services} />
        </div>
        <div className="space-y-6">
          <ContactPanel contact={primaryContact} lead={lead} />
          <NotesPanel lead={lead} />
        </div>
      </div>
    </div>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-p360-ink">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function AnalysisPanel({ analysis }: { analysis: LeadDetail["analyses"][number] | undefined }) {
  if (!analysis) {
    return (
      <Section title="Analyse">
        <p className="text-sm text-p360-muted">Aucune analyse encore réalisée. Cliquez sur « Analyser (IA) ».</p>
      </Section>
    );
  }
  return (
    <Section title="Analyse">
      <p className="text-sm text-p360-ink mb-3">{analysis.summary}</p>
      <div className="grid grid-cols-2 gap-4 text-sm mb-3">
        <div><span className="text-p360-muted">Priorité : </span>{analysis.priorityLevel}</div>
        <div><span className="text-p360-muted">Service recommandé : </span>{analysis.recommendedService}</div>
      </div>
      {analysis.opportunities.length > 0 && (
        <div className="mb-2">
          <div className="text-xs font-semibold text-p360-success">Opportunités</div>
          <ul className="text-sm list-disc list-inside text-p360-ink">{analysis.opportunities.map((o, i) => <li key={i}>{o}</li>)}</ul>
        </div>
      )}
      {analysis.negativeSignals.length > 0 && (
        <div className="mb-2">
          <div className="text-xs font-semibold text-p360-danger">Signaux négatifs</div>
          <ul className="text-sm list-disc list-inside text-p360-ink">{analysis.negativeSignals.map((o, i) => <li key={i}>{o}</li>)}</ul>
        </div>
      )}
      <div className="grid grid-cols-3 gap-3 mt-3 text-xs">
        <div>
          <div className="font-semibold text-p360-ink mb-1">Vérifié</div>
          <ul className="text-p360-muted space-y-0.5">{analysis.verifiedFacts.map((f, i) => <li key={i}>• {f}</li>)}</ul>
        </div>
        <div>
          <div className="font-semibold text-p360-warning mb-1">Estimé</div>
          <ul className="text-p360-muted space-y-0.5">{analysis.estimatedFacts.map((f, i) => <li key={i}>• {f}</li>)}</ul>
        </div>
        <div>
          <div className="font-semibold text-p360-muted mb-1">Manquant</div>
          <ul className="text-p360-muted space-y-0.5">{analysis.missingInfo.map((f, i) => <li key={i}>• {f}</li>)}</ul>
        </div>
      </div>
    </Section>
  );
}

function ContactPanel({ contact, lead }: { contact: LeadDetail["contacts"][number] | undefined; lead: LeadDetail }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    establishmentName: lead.establishmentName,
    category: lead.category,
    city: lead.city ?? "",
    region: lead.region ?? "",
    websiteUrl: lead.websiteUrl ?? "",
    reviewCount: lead.reviewCount?.toString() ?? "",
    averageRating: lead.averageRating?.toString() ?? "",
    hasVirtualTour: lead.hasVirtualTour === null || lead.hasVirtualTour === undefined ? "" : String(lead.hasVirtualTour),
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiPut(`/api/leads/${lead.id}`, {
        establishmentName: form.establishmentName,
        category: form.category,
        city: form.city || undefined,
        region: form.region || undefined,
        websiteUrl: form.websiteUrl || undefined,
        reviewCount: form.reviewCount || undefined,
        averageRating: form.averageRating || undefined,
        hasVirtualTour: form.hasVirtualTour === "" ? undefined : form.hasVirtualTour === "true",
      });
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de la modification de la fiche.");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <Section title="Fiche">
        <form onSubmit={save} className="space-y-3 text-sm">
          <div>
            <label className="label">Nom de l&apos;établissement</label>
            <input className="input" value={form.establishmentName} onChange={(e) => setForm((f) => ({ ...f, establishmentName: e.target.value }))} required />
          </div>
          <div>
            <label className="label">Catégorie</label>
            <select className="input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as typeof form.category }))}>
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Ville</label>
              <input className="input" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
            </div>
            <div>
              <label className="label">Région</label>
              <input className="input" value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Site internet</label>
            <input className="input" value={form.websiteUrl} onChange={(e) => setForm((f) => ({ ...f, websiteUrl: e.target.value }))} placeholder="https://" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Nombre d&apos;avis</label>
              <input type="number" className="input" value={form.reviewCount} onChange={(e) => setForm((f) => ({ ...f, reviewCount: e.target.value }))} />
            </div>
            <div>
              <label className="label">Note moyenne</label>
              <input type="number" step="0.1" min={0} max={5} className="input" value={form.averageRating} onChange={(e) => setForm((f) => ({ ...f, averageRating: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Visite virtuelle existante ?</label>
            <select className="input" value={form.hasVirtualTour} onChange={(e) => setForm((f) => ({ ...f, hasVirtualTour: e.target.value }))}>
              <option value="">Inconnu</option>
              <option value="true">Oui</option>
              <option value="false">Non</option>
            </select>
          </div>
          {error && <p className="text-sm text-p360-danger">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary text-sm">{busy ? "Enregistrement…" : "Enregistrer"}</button>
            <button type="button" className="btn-secondary text-sm" onClick={() => setEditing(false)}>Annuler</button>
          </div>
        </form>
      </Section>
    );
  }

  return (
    <Section title="Fiche" action={<button className="text-xs text-p360-blue hover:underline" onClick={() => setEditing(true)}>Modifier</button>}>
      <dl className="text-sm space-y-1.5">
        <div className="flex justify-between"><dt className="text-p360-muted">Nom</dt><dd className="text-p360-ink">{contact?.fullName ?? "—"}</dd></div>
        <div className="flex justify-between"><dt className="text-p360-muted">Fonction</dt><dd className="text-p360-ink">{contact?.jobTitle ?? "—"}</dd></div>
        <div className="flex justify-between"><dt className="text-p360-muted">Email</dt><dd className="text-p360-ink">{contact?.email ?? "—"}</dd></div>
        <div className="flex justify-between"><dt className="text-p360-muted">Téléphone</dt><dd className="text-p360-ink">{contact?.phone ?? "—"}</dd></div>
        <div className="flex justify-between"><dt className="text-p360-muted">Site</dt><dd className="text-p360-ink truncate max-w-[150px]">{lead.websiteUrl ?? "—"}</dd></div>
        <div className="flex justify-between"><dt className="text-p360-muted">Avis</dt><dd className="text-p360-ink">{lead.reviewCount ?? "—"} ({lead.averageRating ?? "—"}/5)</dd></div>
        <div className="flex justify-between"><dt className="text-p360-muted">Visite virtuelle</dt><dd className="text-p360-ink">{lead.hasVirtualTour === null ? "inconnue" : lead.hasVirtualTour ? "oui" : "non"}</dd></div>
      </dl>
    </Section>
  );
}

function NotesPanel({ lead }: { lead: LeadDetail }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/leads/${lead.id}/notes`, { body });
      setBody("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'ajout de la note.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Notes">
      <form onSubmit={submit} className="space-y-2 mb-4">
        <textarea className="input" rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Ajouter une note…" />
        <button type="submit" disabled={busy} className="btn-secondary text-sm">Ajouter</button>
        {error && <p className="text-sm text-p360-danger">{error}</p>}
      </form>
      <ul className="space-y-3">
        {lead.notes.map((n) => (
          <li key={n.id} className="text-sm">
            <div className="text-p360-ink">{n.body}</div>
            <div className="text-xs text-p360-muted">{n.author.firstName} {n.author.lastName} — {formatDate(n.createdAt)}</div>
          </li>
        ))}
        {lead.notes.length === 0 && <p className="text-sm text-p360-muted">Aucune note.</p>}
      </ul>
    </Section>
  );
}

function MessagesPanel({ lead, canValidate }: { lead: LeadDetail; canValidate: boolean }) {
  const router = useRouter();
  const [type, setType] = useState("FIRST_CONTACT_EMAIL");
  const [tone, setTone] = useState("PROFESSIONAL");
  const [language, setLanguage] = useState("FR");
  const [busy, setBusy] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy("generate");
    setError(null);
    try {
      await apiPost("/api/messages/generate", { leadId: lead.id, type, tone, language });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de la génération du message.");
    } finally {
      setBusy(null);
    }
  }

  async function validate(messageId: string, approve: boolean, editedBody?: string) {
    setBusy(messageId);
    setError(null);
    try {
      await apiPost(`/api/messages/${messageId}/validate`, { approve, editedBody });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de la validation du message.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section title="Messages">
      <div className="flex flex-wrap gap-2 mb-4">
        <select className="input w-auto" value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(MESSAGE_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input w-auto" value={tone} onChange={(e) => setTone(e.target.value)}>
          <option value="PROFESSIONAL">Professionnel</option>
          <option value="DIRECT_MODERN">Direct et moderne</option>
          <option value="PREMIUM">Haut de gamme</option>
        </select>
        <select className="input w-auto" value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="FR">Français</option>
          <option value="EN">Anglais</option>
          <option value="HR">Croate</option>
          <option value="IT">Italien</option>
          <option value="ES">Espagnol</option>
        </select>
        <button className="btn-primary" disabled={busy === "generate" || lead.isSuppressed} onClick={generate}>
          {busy === "generate" ? "Génération…" : "Générer un message"}
        </button>
      </div>
      {lead.isSuppressed && <p className="text-xs text-p360-danger mb-3">Ce prospect est désinscrit : aucun nouveau message ne pourra être envoyé.</p>}
      {error && <p className="text-sm text-p360-danger mb-3">{error}</p>}

      <ul className="space-y-3">
        {lead.messages.map((m) => (
          <li key={m.id} className="border border-p360-lavender-light rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-p360-blue">{MESSAGE_TYPE_LABEL[m.type] ?? m.type}</span>
              <span className={clsx("badge", m.status === "SENT" ? "bg-green-50 text-p360-success" : m.status === "PENDING_VALIDATION" ? "bg-p360-sand-light text-p360-warning" : m.status === "FAILED" ? "bg-red-50 text-p360-danger" : "bg-gray-100 text-gray-600")}>
                {m.status}
              </span>
            </div>
            {m.subject && <div className="text-sm font-medium text-p360-ink">{m.subject}</div>}
            {m.status === "PENDING_VALIDATION" && canValidate ? (
              <>
                <textarea
                  className="input text-sm mt-2"
                  rows={5}
                  defaultValue={m.body}
                  onChange={(e) => setEdits((prev) => ({ ...prev, [m.id]: e.target.value }))}
                />
                <div className="flex gap-2 mt-2">
                  <button className="btn-primary text-sm" disabled={busy === m.id} onClick={() => validate(m.id, true, edits[m.id])}>
                    Valider et envoyer
                  </button>
                  <button className="btn-danger text-sm" disabled={busy === m.id} onClick={() => validate(m.id, false)}>
                    Rejeter
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-p360-ink whitespace-pre-wrap mt-1">{m.body}</p>
            )}
            <div className="text-xs text-p360-muted mt-2">{formatDate(m.createdAt)}</div>
          </li>
        ))}
        {lead.messages.length === 0 && <p className="text-sm text-p360-muted">Aucun message.</p>}
      </ul>
    </Section>
  );
}

function SequencePanel({ lead, sequences }: { lead: LeadDetail; sequences: (SequenceModel & { steps: SequenceStepModel[] })[] }) {
  const router = useRouter();
  const [sequenceId, setSequenceId] = useState(sequences[0]?.id ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function enroll() {
    setBusy("enroll");
    setError(null);
    try {
      await apiPost("/api/enrollments", { leadId: lead.id, sequenceId });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(null);
    }
  }

  async function stop(enrollmentId: string) {
    setBusy(enrollmentId);
    setError(null);
    try {
      await apiPost(`/api/enrollments/${enrollmentId}/stop`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'arrêt de la séquence.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section title="Séquences">
      <div className="flex gap-2 mb-4">
        <select className="input" value={sequenceId} onChange={(e) => setSequenceId(e.target.value)}>
          {sequences.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.steps.length} étapes)</option>)}
        </select>
        <button className="btn-primary shrink-0" disabled={busy === "enroll" || !sequenceId || lead.isSuppressed} onClick={enroll}>
          {busy === "enroll" ? "Inscription…" : "Inscrire"}
        </button>
      </div>
      {error && <p className="text-sm text-p360-danger mb-2">{error}</p>}
      <ul className="space-y-2">
        {lead.enrollments.map((en) => (
          <li key={en.id} className="flex items-center justify-between text-sm border border-p360-lavender-light rounded-lg px-3 py-2">
            <div>
              <div className="text-p360-ink font-medium">{en.sequence.name}</div>
              <div className="text-xs text-p360-muted">
                Statut : {en.status} {en.stopReason ? `(${en.stopReason})` : ""} — étape {en.currentStepOrder}
                {en.nextRunAt ? ` — prochaine action ${formatDate(en.nextRunAt)}` : ""}
              </div>
            </div>
            {en.status === "ACTIVE" && (
              <button className="btn-secondary text-xs" disabled={busy === en.id} onClick={() => stop(en.id)}>Arrêter</button>
            )}
          </li>
        ))}
        {lead.enrollments.length === 0 && <p className="text-sm text-p360-muted">Aucune inscription à une séquence.</p>}
      </ul>
    </Section>
  );
}

const REPLY_PRESETS: { key: string; label: string }[] = [
  { key: "interested", label: "Intéressé" },
  { key: "price", label: "Demande de tarif" },
  { key: "callback", label: "Demande de rappel" },
  { key: "not_interested", label: "Pas intéressé" },
  { key: "unsubscribe", label: "Désinscription" },
];

function InboxPanel({ lead }: { lead: LeadDetail }) {
  const router = useRouter();
  const [customText, setCustomText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function simulate(preset?: string) {
    setBusy(preset ?? "custom");
    setError(null);
    try {
      await apiPost(`/api/leads/${lead.id}/simulate-reply`, preset ? { preset } : { body: customText });
      setCustomText("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de la simulation de la réponse.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section title="Boîte de réception">
      <div className="mb-4 border border-dashed border-p360-lavender rounded-lg p-3 bg-p360-lavender-light/30">
        <p className="text-xs text-p360-muted mb-2">Mode démo — simuler une réponse entrante du prospect :</p>
        <div className="flex flex-wrap gap-2 mb-2">
          {REPLY_PRESETS.map((p) => (
            <button key={p.key} className="btn-secondary text-xs" disabled={busy === p.key} onClick={() => simulate(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="input text-sm" placeholder="Ou saisir un message libre…" value={customText} onChange={(e) => setCustomText(e.target.value)} />
          <button className="btn-secondary text-sm shrink-0" disabled={busy === "custom" || !customText.trim()} onClick={() => simulate()}>
            Envoyer
          </button>
        </div>
        {error && <p className="text-sm text-p360-danger mt-2">{error}</p>}
      </div>
      <ul className="space-y-3">
        {lead.conversations.map((c) => (
          <li key={c.id} className={clsx("text-sm rounded-lg p-3", c.direction === "inbound" ? "bg-p360-lavender-light/40" : "bg-gray-50")}>
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-semibold text-p360-blue">{c.direction === "inbound" ? "Reçu" : "Envoyé"}</span>
              {c.intent && <span className="badge bg-white border border-p360-lavender text-p360-blue">{INTENT_LABEL[c.intent] ?? c.intent}</span>}
            </div>
            <p className="text-p360-ink whitespace-pre-wrap">{c.body}</p>
            <div className="text-xs text-p360-muted mt-1">{formatDate(c.createdAt)}</div>
          </li>
        ))}
        {lead.conversations.length === 0 && <p className="text-sm text-p360-muted">Aucun échange.</p>}
      </ul>
    </Section>
  );
}

function AppointmentsPanel({ lead }: { lead: LeadDetail }) {
  const router = useRouter();
  const [title, setTitle] = useState("Visite / présentation");
  const [startAt, setStartAt] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!startAt) return;
    setBusy(true);
    setError(null);
    try {
      const start = new Date(startAt);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      await apiPost("/api/appointments", { leadId: lead.id, title, startAt: start.toISOString(), endAt: end.toISOString(), location });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Rendez-vous">
      <form onSubmit={submit} className="flex flex-wrap gap-2 items-end mb-4">
        <div>
          <label className="label">Titre</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label">Date et heure</label>
          <input type="datetime-local" className="input" value={startAt} onChange={(e) => setStartAt(e.target.value)} required />
        </div>
        <div>
          <label className="label">Lieu</label>
          <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Sur place / visio" />
        </div>
        <button type="submit" disabled={busy} className="btn-primary">{busy ? "Création…" : "Créer"}</button>
      </form>
      {error && <p className="text-sm text-p360-danger mb-2">{error}</p>}
      <ul className="space-y-2">
        {lead.appointments.map((a) => (
          <li key={a.id} className="text-sm border border-p360-lavender-light rounded-lg px-3 py-2">
            <div className="text-p360-ink font-medium">{a.title}</div>
            <div className="text-xs text-p360-muted">{formatDate(a.startAt)} — {a.status} {a.location ? `— ${a.location}` : ""}</div>
          </li>
        ))}
        {lead.appointments.length === 0 && <p className="text-sm text-p360-muted">Aucun rendez-vous.</p>}
      </ul>
    </Section>
  );
}

function OpportunitiesPanel({ lead, services }: { lead: LeadDetail; services: ServiceModel[] }) {
  const router = useRouter();
  const [name, setName] = useState("Visite virtuelle 360°");
  const [value, setValue] = useState("450");
  const [busy, setBusy] = useState<string | null>(null);
  const [quoteServiceId, setQuoteServiceId] = useState(services[0]?.id ?? "");
  const [opportunityId, setOpportunityId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function createOpportunity(e: React.FormEvent) {
    e.preventDefault();
    setBusy("opp");
    setError(null);
    try {
      await apiPost("/api/opportunities", { leadId: lead.id, name, estimatedValue: Math.round(Number(value) * 100) });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de la création de l'opportunité.");
    } finally {
      setBusy(null);
    }
  }

  async function setOpportunityStatus(id: string, status: "WON" | "LOST") {
    setBusy(id);
    setError(null);
    try {
      await apiPatch(`/api/opportunities/${id}`, { status });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de la mise à jour de l'opportunité.");
    } finally {
      setBusy(null);
    }
  }

  async function createQuote() {
    const service = services.find((s) => s.id === quoteServiceId);
    if (!service) return;
    setBusy("quote");
    setError(null);
    try {
      await apiPost("/api/quotes", {
        leadId: lead.id,
        opportunityId: opportunityId || undefined,
        lines: [{ serviceId: service.id, label: service.name, quantity: 1, unitPrice: service.basePrice }],
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de la création du devis.");
    } finally {
      setBusy(null);
    }
  }

  async function markQuoteSent(id: string) {
    setBusy(id);
    setError(null);
    try {
      await apiPatch(`/api/quotes/${id}`, { status: "SENT" });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'envoi du devis.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section title="Opportunités & devis">
      <form onSubmit={createOpportunity} className="flex flex-wrap gap-2 items-end mb-4">
        <div>
          <label className="label">Opportunité</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Montant estimé (€)</label>
          <input type="number" className="input w-32" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <button type="submit" disabled={busy === "opp"} className="btn-secondary">Créer l&apos;opportunité</button>
      </form>
      {error && <p className="text-sm text-p360-danger mb-3">{error}</p>}

      <ul className="space-y-2 mb-4">
        {lead.opportunities.map((o) => (
          <li key={o.id} className="text-sm border border-p360-lavender-light rounded-lg px-3 py-2 flex items-center justify-between">
            <div>
              <div className="text-p360-ink font-medium">{o.name} — {formatEuros(o.estimatedValue)}</div>
              <div className="text-xs text-p360-muted">Statut : {o.status}</div>
            </div>
            {o.status === "OPEN" && (
              <div className="flex gap-2">
                <button className="btn-secondary text-xs" disabled={busy === o.id} onClick={() => setOpportunityStatus(o.id, "WON")}>Gagné</button>
                <button className="btn-secondary text-xs" disabled={busy === o.id} onClick={() => setOpportunityStatus(o.id, "LOST")}>Perdu</button>
              </div>
            )}
          </li>
        ))}
        {lead.opportunities.length === 0 && <p className="text-sm text-p360-muted">Aucune opportunité.</p>}
      </ul>

      <div className="border-t border-p360-lavender-light pt-4">
        <div className="flex flex-wrap gap-2 items-end mb-3">
          <div>
            <label className="label">Offre</label>
            <select className="input" value={quoteServiceId} onChange={(e) => setQuoteServiceId(e.target.value)}>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name} — {formatEuros(s.basePrice)}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Lier à l&apos;opportunité</label>
            <select className="input" value={opportunityId} onChange={(e) => setOpportunityId(e.target.value)}>
              <option value="">—</option>
              {lead.opportunities.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <button className="btn-primary" disabled={busy === "quote"} onClick={createQuote}>Créer un devis</button>
        </div>
        <ul className="space-y-2">
          {lead.quotes.map((q) => (
            <li key={q.id} className="text-sm border border-p360-lavender-light rounded-lg px-3 py-2 flex items-center justify-between">
              <div>
                <div className="text-p360-ink font-medium">{q.reference} — {formatEuros(q.totalAmount)}</div>
                <div className="text-xs text-p360-muted">Statut : {q.status}</div>
              </div>
              {q.status === "DRAFT" && (
                <button className="btn-secondary text-xs" disabled={busy === q.id} onClick={() => markQuoteSent(q.id)}>Marquer envoyé</button>
              )}
            </li>
          ))}
          {lead.quotes.length === 0 && <p className="text-sm text-p360-muted">Aucun devis.</p>}
        </ul>
      </div>

      <div className="mt-3">
        <Link href="/quotes" className="text-xs text-p360-blue hover:underline">Voir tous les devis</Link>
      </div>
    </Section>
  );
}
