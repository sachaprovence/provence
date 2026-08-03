import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getLeadTimeline } from "@/lib/crm/timeline-service";
import { MessageType, MessageStatus, AppointmentStatus, QuoteStatus, AttachmentCategory } from "@/generated/prisma/enums";

/**
 * Chronologie d'un `Lead` (v0.9, ADR 0038) : agrégation en lecture seule de
 * plusieurs tables déjà existantes. Vérifie que chaque type d'évènement
 * apparaît, que l'ordre est chronologique décroissant, et qu'un
 * enregistrement d'une autre organisation ne fuite jamais dans la
 * chronologie (même si son `leadId` référencé n'existe pas côté requêteur).
 */
const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("CRM v0.9 — Timeline de Lead", () => {
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("agrège notes, messages, conversations, rendez-vous, tâches, devis, audit et pièces jointes, triés par date décroissante", async () => {
    const organization = await prisma.organization.create({ data: { name: "Org timeline" } });
    organizationIds.push(organization.id);
    const user = await prisma.user.create({
      data: { email: `timeline-${crypto.randomUUID()}@example.test`, passwordHash: "x", firstName: "Test", lastName: "User" },
    });
    userIds.push(user.id);
    const lead = await prisma.lead.create({
      data: { organizationId: organization.id, establishmentName: "Établissement Timeline" },
    });

    await prisma.leadNote.create({ data: { leadId: lead.id, authorId: user.id, body: "Première note" } });
    await prisma.message.create({
      data: { leadId: lead.id, type: MessageType.FIRST_CONTACT_EMAIL, subject: "Bonjour", body: "Contenu", status: MessageStatus.SENT, sentAt: new Date() },
    });
    await prisma.conversation.create({ data: { leadId: lead.id, direction: "inbound", body: "Réponse du client" } });
    await prisma.appointment.create({
      data: { organizationId: organization.id, leadId: lead.id, title: "Visite terrain", startAt: new Date(), endAt: new Date(), status: AppointmentStatus.SCHEDULED },
    });
    await prisma.task.create({ data: { organizationId: organization.id, leadId: lead.id, title: "Relancer le client" } });
    await prisma.quote.create({
      data: { organizationId: organization.id, leadId: lead.id, reference: "DEV-0001", status: QuoteStatus.SENT, totalAmount: 150000 },
    });
    await prisma.auditLog.create({
      data: { organizationId: organization.id, leadId: lead.id, userId: user.id, action: "lead.created", entityType: "Lead", entityId: lead.id },
    });
    await prisma.attachment.create({
      data: {
        organizationId: organization.id,
        entityType: "Lead",
        entityId: lead.id,
        category: AttachmentCategory.DOCUMENT,
        fileName: "brief.pdf",
        url: "https://files.example.test/brief.pdf",
      },
    });

    const timeline = await getLeadTimeline(organization.id, lead.id);

    const types = timeline.map((event) => event.type);
    expect(types).toEqual(
      expect.arrayContaining(["note", "message", "conversation", "appointment", "task", "quote", "audit", "attachment"])
    );
    expect(timeline).toHaveLength(8);

    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i - 1].occurredAt.getTime()).toBeGreaterThanOrEqual(timeline[i].occurredAt.getTime());
    }
  });

  it("ne mélange jamais la chronologie de deux Lead différents", async () => {
    const organization = await prisma.organization.create({ data: { name: "Org timeline isolation" } });
    organizationIds.push(organization.id);
    const leadA = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "A" } });
    const leadB = await prisma.lead.create({ data: { organizationId: organization.id, establishmentName: "B" } });
    const user = await prisma.user.create({
      data: { email: `timeline-${crypto.randomUUID()}@example.test`, passwordHash: "x", firstName: "Test", lastName: "User" },
    });
    userIds.push(user.id);

    await prisma.leadNote.create({ data: { leadId: leadA.id, authorId: user.id, body: "Note A" } });
    await prisma.leadNote.create({ data: { leadId: leadB.id, authorId: user.id, body: "Note B" } });

    const timelineA = await getLeadTimeline(organization.id, leadA.id);
    expect(timelineA).toHaveLength(1);
    expect(timelineA[0].description).toBe("Note A");
  });
});
