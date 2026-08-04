"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DndContext, DragOverlay, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { apiPut, ApiError } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast-provider";
import { ScoreBadge } from "@/components/score-badge";

export type KanbanStage = { stageKey: string; label: string; color: string };
export type KanbanLead = { id: string; establishmentName: string; city: string | null; stage: string; scoreValue?: number };

/**
 * Kanban glisser-déposer (v1.1, AR-0183) — change `Lead.stage` en
 * déposant une carte dans une autre colonne, via EXACTEMENT la même route
 * (`PUT /api/leads/[id]`, `{ stage }`) que le menu déroulant de la fiche
 * prospect (`lead-detail-client.tsx`) — même transition serveur, même
 * évènement `lead.stage_changed` publié (AR-0165), aucun chemin
 * dupliqué. `@dnd-kit/core` (voir ADR 0043) : réordonnancement entre
 * colonnes, accessibilité clavier et performance sur de longues listes
 * mieux couvertes par une librairie mûre qu'une réimplémentation maison.
 */
export function LeadsKanbanBoard({ stages, leads }: { stages: KanbanStage[]; leads: KanbanLead[] }) {
  const router = useRouter();
  const { push } = useToast();
  const [items, setItems] = useState(leads);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const leadId = String(active.id);
    const targetStage = String(over.id);
    const lead = items.find((l) => l.id === leadId);
    if (!lead || lead.stage === targetStage) return;

    const previousStage = lead.stage;
    setItems((prev) => prev.map((l) => (l.id === leadId ? { ...l, stage: targetStage } : l)));
    setPendingId(leadId);

    try {
      await apiPut(`/api/leads/${leadId}`, { stage: targetStage });
      router.refresh();
    } catch (err) {
      setItems((prev) => prev.map((l) => (l.id === leadId ? { ...l, stage: previousStage } : l)));
      push({ title: "Échec du changement d'étape", description: err instanceof ApiError ? err.message : "Erreur.", variant: "error" });
    } finally {
      setPendingId(null);
    }
  }

  const activeLead = activeId ? items.find((l) => l.id === activeId) : null;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const stageLeads = items.filter((l) => l.stage === stage.stageKey);
          return (
            <KanbanColumn key={stage.stageKey} stage={stage} leads={stageLeads} pendingId={pendingId} />
          );
        })}
      </div>
      <DragOverlay>{activeLead ? <LeadCard lead={activeLead} dragging /> : null}</DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({ stage, leads, pendingId }: { stage: KanbanStage; leads: KanbanLead[]; pendingId: string | null }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.stageKey });

  return (
    <div ref={setNodeRef} className="w-64 shrink-0">
      <div className="text-xs font-semibold text-p360-muted mb-2 px-1 flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: stage.color }} />
        {stage.label} ({leads.length})
      </div>
      <div className={`space-y-2 min-h-16 rounded-lg transition-colors ${isOver ? "bg-p360-lavender-light/60" : ""}`}>
        {leads.map((lead) => (
          <DraggableLeadCard key={lead.id} lead={lead} busy={pendingId === lead.id} />
        ))}
      </div>
    </div>
  );
}

function DraggableLeadCard({ lead, busy }: { lead: KanbanLead; busy: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className={isDragging ? "opacity-30" : busy ? "opacity-60" : ""}>
      <LeadCard lead={lead} />
    </div>
  );
}

function LeadCard({ lead, dragging = false }: { lead: KanbanLead; dragging?: boolean }) {
  return (
    <Link
      href={`/leads/${lead.id}`}
      onClick={(e) => dragging && e.preventDefault()}
      className={`card p-3 block hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing ${dragging ? "shadow-lg" : ""}`}
    >
      <div className="text-sm font-medium text-p360-ink">{lead.establishmentName}</div>
      <div className="text-xs text-p360-muted mt-0.5">{lead.city ?? "—"}</div>
      <div className="mt-2"><ScoreBadge value={lead.scoreValue} /></div>
    </Link>
  );
}
