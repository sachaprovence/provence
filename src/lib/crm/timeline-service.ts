import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Chronologie complète d'un `Lead` (brief v0.9 : "Créer une chronologie
 * complète. Historique des échanges. Notes. Documents.") — SERVICE DE
 * LECTURE SEULE qui agrège `LeadNote`/`Message`/`Conversation`/`Appointment`/
 * `Task`/`Quote`/`AuditLog`/`Attachment`, jamais une nouvelle table
 * d'écriture (voir ADR 0038). Chaque type de ressource garde sa table
 * dédiée (déjà utilisée par le scoring, les séquences, l'inbox...) ; cette
 * fonction se contente de les relire et de les fusionner par date.
 */

export type TimelineEventType =
  | "note"
  | "message"
  | "conversation"
  | "appointment"
  | "task"
  | "quote"
  | "audit"
  | "attachment";

export interface TimelineEvent {
  type: TimelineEventType;
  id: string;
  occurredAt: Date;
  title: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
}

export async function getLeadTimeline(organizationId: string, leadId: string): Promise<TimelineEvent[]> {
  const [notes, messages, conversations, appointments, tasks, quotes, auditLogs, attachments] = await Promise.all([
    prisma.leadNote.findMany({
      where: { leadId, lead: { organizationId } },
      include: { author: { select: { firstName: true, lastName: true } } },
    }),
    prisma.message.findMany({ where: { leadId, lead: { organizationId } } }),
    prisma.conversation.findMany({ where: { leadId, lead: { organizationId } } }),
    prisma.appointment.findMany({ where: { leadId, organizationId } }),
    prisma.task.findMany({ where: { leadId, organizationId } }),
    prisma.quote.findMany({ where: { leadId, organizationId } }),
    prisma.auditLog.findMany({ where: { leadId, organizationId } }),
    prisma.attachment.findMany({ where: { entityType: "Lead", entityId: leadId, organizationId } }),
  ]);

  const events: TimelineEvent[] = [
    ...notes.map((note): TimelineEvent => ({
      type: "note",
      id: note.id,
      occurredAt: note.createdAt,
      title: `Note de ${note.author.firstName} ${note.author.lastName}`,
      description: note.body,
    })),
    ...messages.map((message): TimelineEvent => ({
      type: "message",
      id: message.id,
      occurredAt: message.sentAt ?? message.createdAt,
      title: message.subject || `Message (${message.type.toLowerCase()})`,
      description: message.body,
      metadata: { status: message.status, channel: message.channel },
    })),
    ...conversations.map((conversation): TimelineEvent => ({
      type: "conversation",
      id: conversation.id,
      occurredAt: conversation.createdAt,
      title: conversation.subject || `Échange ${conversation.direction === "INBOUND" ? "reçu" : "envoyé"}`,
      description: conversation.body,
      metadata: { direction: conversation.direction, intent: conversation.intent },
    })),
    ...appointments.map((appointment): TimelineEvent => ({
      type: "appointment",
      id: appointment.id,
      occurredAt: appointment.startAt,
      title: appointment.title,
      description: appointment.summary || appointment.notes,
      metadata: { status: appointment.status, location: appointment.location },
    })),
    ...tasks.map((task): TimelineEvent => ({
      type: "task",
      id: task.id,
      occurredAt: task.dueAt ?? task.createdAt,
      title: task.title,
      description: task.description,
      metadata: { status: task.status },
    })),
    ...quotes.map((quote): TimelineEvent => ({
      type: "quote",
      id: quote.id,
      occurredAt: quote.createdAt,
      title: `Devis ${quote.reference}`,
      description: `${(quote.totalAmount / 100).toFixed(2)} € — statut ${quote.status}`,
      metadata: { status: quote.status, totalAmount: quote.totalAmount },
    })),
    ...auditLogs.map((log): TimelineEvent => ({
      type: "audit",
      id: log.id,
      occurredAt: log.createdAt,
      title: log.action,
      metadata: (log.metadata as Record<string, unknown> | null) ?? undefined,
    })),
    ...attachments.map((attachment): TimelineEvent => ({
      type: "attachment",
      id: attachment.id,
      occurredAt: attachment.createdAt,
      title: attachment.fileName,
      description: attachment.url,
      metadata: { category: attachment.category, mimeType: attachment.mimeType },
    })),
  ];

  return events.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
}
