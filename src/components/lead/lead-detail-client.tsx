"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { apiPost, apiPut, apiPatch, apiDelete, ApiError } from "@/lib/api-client";
import type { LeadDetail } from "@/app/(app)/leads/[id]/page";
import { CATEGORY_LABEL, MESSAGE_TYPE_LABEL, INTENT_LABEL } from "@/lib/labels";
import { ScoreBadge } from "@/components/score-badge";
import { TagBadge } from "@/components/tag-manager";
import { AttachmentGallery } from "@/components/attachment-gallery";
import type { SequenceModel, SequenceStepModel, ServiceModel, PipelineStageModel, TagModel } from "@/generated/prisma/models";
import type { TimelineEvent, TimelineEventType } from "@/lib/crm/timeline-service";
import type { listAttachments } from "@/lib/crm/attachment-service";
import type { listContactsForLead, listContacts } from "@/lib/crm/contact-service";

type Props = {
  lead: LeadDetail;
  sequences: (SequenceModel & { steps: SequenceStepModel[] })[];
  services: ServiceModel[];
  pipelineStages: PipelineStageModel[];
  allTags: TagModel[];
  timeline: TimelineEvent[];
  attachments: Awaited<ReturnType<typeof listAttachments>>;
  contactLinks: Awaited<ReturnType<typeof listContactsForLead>>;
  allContacts: Awaited<ReturnType<typeof listContacts>>;
  canValidate: boolean;
};

function formatDate(d: Date | string) {
  return new Date(d).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}
function formatEuros(cents: number) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}
function googleMapsUrl(lead: LeadDetail): string | null {
  if (lead.latitude != null && lead.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${lead.latitude},${lead.longitude}`;
  }
  const parts = [lead.address, lead.city, lead.country].filter(Boolean);
  if (parts.length === 0) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(", "))}`;
}

export function LeadDetailClient({ lead, sequences, services, pipelineStages, allTags, timeline, attachments, contactLinks, allContacts, canValidate }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const analysis = lead.analyses[0];
  const score = lead.scores[0];
  const primaryContact = lead.contacts[0];
  const mapsUrl = googleMapsUrl(lead);

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
            {pipelineStages.map((s) => (
              <option key={s.stageKey} value={s.stageKey}>{s.label}</option>
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
          <TimelinePanel timeline={timeline} />
          <AnalysisPanel analysis={analysis} />
          <MessagesPanel lead={lead} canValidate={canValidate} />
          <SequencePanel lead={lead} sequences={sequences} />
          <InboxPanel lead={lead} />
          <AppointmentsPanel lead={lead} />
          <VisitsPanel lead={lead} />
          <OpportunitiesPanel lead={lead} services={services} />
          <InvoicesPanel lead={lead} />
          <TasksPanel lead={lead} />
        </div>
        <div className="space-y-6">
          <LocationPanel lead={lead} mapsUrl={mapsUrl} />
          <TagsPanel lead={lead} allTags={allTags} run={run} busy={busy} />
          <ContactPanel contact={primaryContact} lead={lead} />
          <ContactsPanel lead={lead} contactLinks={contactLinks} allContacts={allContacts} run={run} busy={busy} />
          <RelationsPanel lead={lead} />
          <AttachmentGallery entityType="Lead" entityId={lead.id} attachments={attachments} />
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
  return (
    <Section title="Contact">
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      await apiPost(`/api/leads/${lead.id}/notes`, { body });
      setBody("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Notes">
      <form onSubmit={submit} className="space-y-2 mb-4">
        <textarea className="input" rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Ajouter une note…" />
        <button type="submit" disabled={busy} className="btn-secondary text-sm">Ajouter</button>
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

  async function generate() {
    setBusy("generate");
    try {
      await apiPost("/api/messages/generate", { leadId: lead.id, type, tone, language });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function validate(messageId: string, approve: boolean, editedBody?: string) {
    setBusy(messageId);
    try {
      await apiPost(`/api/messages/${messageId}/validate`, { approve, editedBody });
      router.refresh();
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
    try {
      await apiPost(`/api/enrollments/${enrollmentId}/stop`);
      router.refresh();
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

  async function simulate(preset?: string) {
    setBusy(preset ?? "custom");
    try {
      await apiPost(`/api/leads/${lead.id}/simulate-reply`, preset ? { preset } : { body: customText });
      setCustomText("");
      router.refresh();
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
  const [discountPercent, setDiscountPercent] = useState("0");
  const [vatRate, setVatRate] = useState("20");

  async function createOpportunity(e: React.FormEvent) {
    e.preventDefault();
    setBusy("opp");
    try {
      await apiPost("/api/opportunities", { leadId: lead.id, name, estimatedValue: Math.round(Number(value) * 100) });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function setOpportunityStatus(id: string, status: "WON" | "LOST") {
    setBusy(id);
    try {
      await apiPatch(`/api/opportunities/${id}`, { status });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function createQuote() {
    const service = services.find((s) => s.id === quoteServiceId);
    if (!service) return;
    setBusy("quote");
    try {
      await apiPost("/api/quotes", {
        leadId: lead.id,
        opportunityId: opportunityId || undefined,
        discountPercent: Number(discountPercent) || 0,
        vatRate: Number(vatRate) || 0,
        lines: [{ serviceId: service.id, label: service.name, quantity: 1, unitPrice: service.basePrice }],
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function markQuoteSent(id: string) {
    setBusy(id);
    try {
      await apiPatch(`/api/quotes/${id}`, { status: "SENT" });
      router.refresh();
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
          <div>
            <label className="label">Remise (%)</label>
            <input type="number" className="input w-20" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} min={0} max={100} />
          </div>
          <div>
            <label className="label">TVA (%)</label>
            <input type="number" className="input w-20" value={vatRate} onChange={(e) => setVatRate(e.target.value)} min={0} max={100} />
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
              <div className="flex gap-2 items-center">
                <a className="text-xs text-p360-muted hover:underline" href={`/api/quotes/${q.id}/pdf`} target="_blank" rel="noreferrer">PDF</a>
                {q.status === "DRAFT" && (
                  <button className="btn-secondary text-xs" disabled={busy === q.id} onClick={() => markQuoteSent(q.id)}>Marquer envoyé</button>
                )}
              </div>
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

const TIMELINE_TYPE_LABEL: Record<TimelineEventType, string> = {
  note: "Note",
  message: "Message",
  conversation: "Échange",
  appointment: "Rendez-vous",
  task: "Tâche",
  quote: "Devis",
  audit: "Action",
  attachment: "Pièce jointe",
};

function TimelinePanel({ timeline }: { timeline: TimelineEvent[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? timeline : timeline.slice(0, 8);

  return (
    <Section
      title="Chronologie"
      action={timeline.length > 8 && (
        <button className="text-xs text-p360-blue hover:underline" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Réduire" : `Tout voir (${timeline.length})`}
        </button>
      )}
    >
      <ul className="space-y-3">
        {visible.map((event) => (
          <li key={`${event.type}-${event.id}`} className="flex gap-3 text-sm">
            <span className="badge shrink-0 bg-p360-lavender-light text-p360-blue">{TIMELINE_TYPE_LABEL[event.type]}</span>
            <div className="min-w-0">
              <div className="text-p360-ink font-medium truncate">{event.title}</div>
              {event.description && <div className="text-p360-muted text-xs truncate">{event.description}</div>}
              <div className="text-xs text-p360-muted">{formatDate(event.occurredAt)}</div>
            </div>
          </li>
        ))}
        {timeline.length === 0 && <p className="text-sm text-p360-muted">Aucun évènement pour l&apos;instant.</p>}
      </ul>
    </Section>
  );
}

const VISIT_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Brouillon",
  SCHEDULED: "Programmée",
  IN_PROGRESS: "En cours",
  DELIVERED: "Livrée",
  CANCELLED: "Annulée",
};

function VisitsPanel({ lead }: { lead: LeadDetail }) {
  return (
    <Section title="Visites 3D" action={<Link href="/visits" className="text-xs text-p360-blue hover:underline">Toutes les visites</Link>}>
      <ul className="space-y-2">
        {lead.virtualTours.map((tour) => (
          <li key={tour.id} className="text-sm border border-p360-lavender-light rounded-lg px-3 py-2">
            <div className="flex items-center justify-between">
              <div className="text-p360-ink font-medium">{tour.address ?? tour.mission.title}</div>
              <span className="badge bg-p360-lavender-light text-p360-blue">{VISIT_STATUS_LABEL[tour.status] ?? tour.status}</span>
            </div>
            <div className="text-xs text-p360-muted mt-0.5">
              {tour.scheduledAt ? formatDate(tour.scheduledAt) : "Non planifiée"}
              {tour.surfaceM2 ? ` — ${tour.surfaceM2} m²` : ""}
            </div>
            {(tour.matterportUrl || tour.tourUrl) && (
              <div className="flex gap-3 mt-1">
                {tour.matterportUrl && <a className="text-xs text-p360-blue hover:underline" href={tour.matterportUrl} target="_blank" rel="noreferrer">Matterport</a>}
                {tour.tourUrl && <a className="text-xs text-p360-blue hover:underline" href={tour.tourUrl} target="_blank" rel="noreferrer">Visite en ligne</a>}
              </div>
            )}
          </li>
        ))}
        {lead.virtualTours.length === 0 && <p className="text-sm text-p360-muted">Aucune visite 3D.</p>}
      </ul>
    </Section>
  );
}

const INVOICE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Brouillon",
  SENT: "Envoyée",
  PAID: "Payée",
  OVERDUE: "En retard",
  CANCELLED: "Annulée",
};

function InvoicesPanel({ lead }: { lead: LeadDetail }) {
  return (
    <Section title="Factures" action={<Link href="/invoices" className="text-xs text-p360-blue hover:underline">Toutes les factures</Link>}>
      <ul className="space-y-2">
        {lead.invoices.map((invoice) => (
          <li key={invoice.id} className="text-sm border border-p360-lavender-light rounded-lg px-3 py-2 flex items-center justify-between">
            <div>
              <div className="text-p360-ink font-medium">{invoice.reference} — {formatEuros(invoice.totalAmount)}</div>
              <div className="text-xs text-p360-muted">
                Statut : {INVOICE_STATUS_LABEL[invoice.status] ?? invoice.status}
                {invoice.dueAt ? ` — échéance ${formatDate(invoice.dueAt)}` : ""}
              </div>
            </div>
            <a className="text-xs text-p360-muted hover:underline" href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer">PDF</a>
          </li>
        ))}
        {lead.invoices.length === 0 && <p className="text-sm text-p360-muted">Aucune facture.</p>}
      </ul>
    </Section>
  );
}

function TasksPanel({ lead }: { lead: LeadDetail }) {
  return (
    <Section title="Tâches" action={<Link href="/tasks" className="text-xs text-p360-blue hover:underline">Toutes les tâches</Link>}>
      <ul className="space-y-2">
        {lead.tasks.map((task) => (
          <li key={task.id} className="text-sm border border-p360-lavender-light rounded-lg px-3 py-2 flex items-center justify-between">
            <div>
              <div className="text-p360-ink font-medium">{task.title}</div>
              <div className="text-xs text-p360-muted">{task.dueAt ? formatDate(task.dueAt) : "Sans échéance"}</div>
            </div>
            <span className="badge bg-p360-lavender-light text-p360-blue">{task.status}</span>
          </li>
        ))}
        {lead.tasks.length === 0 && <p className="text-sm text-p360-muted">Aucune tâche.</p>}
      </ul>
    </Section>
  );
}

function LocationPanel({ lead, mapsUrl }: { lead: LeadDetail; mapsUrl: string | null }) {
  return (
    <Section title="Localisation">
      <p className="text-sm text-p360-ink">
        {[lead.address, lead.city, lead.region, lead.country].filter(Boolean).join(", ") || "Adresse non renseignée."}
      </p>
      {mapsUrl && (
        <a className="text-xs text-p360-blue hover:underline mt-2 inline-block" href={mapsUrl} target="_blank" rel="noreferrer">
          Ouvrir dans Google Maps
        </a>
      )}
    </Section>
  );
}

function TagsPanel({
  lead,
  allTags,
  run,
  busy,
}: {
  lead: LeadDetail;
  allTags: TagModel[];
  run: (key: string, fn: () => Promise<unknown>) => Promise<void>;
  busy: string | null;
}) {
  const [selected, setSelected] = useState("");
  const assignedIds = new Set(lead.tagsRelation.map((t) => t.id));
  const available = allTags.filter((t) => !assignedIds.has(t.id));

  return (
    <Section title="Tags">
      <div className="flex flex-wrap gap-1.5 mb-3">
        {lead.tagsRelation.map((tag) => (
          <span key={tag.id} className="inline-flex items-center gap-1">
            <TagBadge tag={tag} />
            <button
              type="button"
              className="text-xs text-p360-muted hover:text-p360-danger"
              disabled={busy === tag.id}
              onClick={() => run(tag.id, () => apiDelete(`/api/leads/${lead.id}/tags/${tag.id}`))}
              aria-label={`Retirer le tag ${tag.name}`}
            >
              ×
            </button>
          </span>
        ))}
        {lead.tagsRelation.length === 0 && <p className="text-sm text-p360-muted">Aucun tag assigné.</p>}
      </div>
      {available.length > 0 && (
        <div className="flex gap-2">
          <select className="input" value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Choisir un tag…</option>
            {available.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button
            className="btn-secondary text-sm shrink-0"
            disabled={!selected || busy === "assign-tag"}
            onClick={() => {
              const tagId = selected;
              setSelected("");
              run("assign-tag", () => apiPost(`/api/leads/${lead.id}/tags`, { tagId }));
            }}
          >
            Assigner
          </button>
        </div>
      )}
    </Section>
  );
}

function ContactsPanel({
  lead,
  contactLinks,
  allContacts,
  run,
  busy,
}: {
  lead: LeadDetail;
  contactLinks: Awaited<ReturnType<typeof listContactsForLead>>;
  allContacts: Awaited<ReturnType<typeof listContacts>>;
  run: (key: string, fn: () => Promise<unknown>) => Promise<void>;
  busy: string | null;
}) {
  const [selected, setSelected] = useState("");
  const linkedIds = new Set(contactLinks.map((l) => l.contactId));
  const available = allContacts.filter((c) => !linkedIds.has(c.id));

  return (
    <Section title="Personnes liées" action={<Link href="/companies" className="text-xs text-p360-blue hover:underline">Gérer les contacts</Link>}>
      <ul className="space-y-2 mb-3">
        {contactLinks.map((link) => (
          <li key={link.id} className="text-sm border border-p360-lavender-light rounded-lg px-3 py-2 flex items-center justify-between">
            <div>
              <div className="text-p360-ink font-medium">{link.contact.fullName}{link.role ? ` — ${link.role}` : ""}</div>
              <div className="text-xs text-p360-muted">{link.contact.email ?? link.contact.phone ?? "—"}</div>
            </div>
            <button
              className="text-xs text-p360-muted hover:text-p360-danger"
              disabled={busy === link.contactId}
              onClick={() => run(link.contactId, () => apiDelete(`/api/leads/${lead.id}/contacts/${link.contactId}`))}
            >
              Retirer
            </button>
          </li>
        ))}
        {contactLinks.length === 0 && <p className="text-sm text-p360-muted">Aucune personne liée.</p>}
      </ul>
      {available.length > 0 && (
        <div className="flex gap-2">
          <select className="input" value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Choisir une personne…</option>
            {available.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}
          </select>
          <button
            className="btn-secondary text-sm shrink-0"
            disabled={!selected || busy === "link-contact"}
            onClick={() => {
              const contactId = selected;
              setSelected("");
              run("link-contact", () => apiPost(`/api/leads/${lead.id}/contacts`, { contactId }));
            }}
          >
            Lier
          </button>
        </div>
      )}
    </Section>
  );
}

function RelationsPanel({ lead }: { lead: LeadDetail }) {
  const hasAny = lead.company || lead.properties.length > 0;
  if (!hasAny) {
    return (
      <Section title="Entreprise & biens">
        <p className="text-sm text-p360-muted">Aucune entreprise ni bien lié à ce prospect.</p>
      </Section>
    );
  }

  return (
    <Section title="Entreprise & biens">
      {lead.company && (
        <div className="mb-3">
          <div className="text-xs font-semibold text-p360-muted mb-1">Entreprise</div>
          <Link href={`/companies/${lead.company.id}`} className="text-sm text-p360-blue hover:underline">
            {lead.company.name}
          </Link>
        </div>
      )}
      {lead.properties.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-p360-muted mb-1">Biens</div>
          <ul className="space-y-1">
            {lead.properties.map((property) => (
              <li key={property.id}>
                <Link href={`/properties/${property.id}`} className="text-sm text-p360-blue hover:underline">
                  {property.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}
