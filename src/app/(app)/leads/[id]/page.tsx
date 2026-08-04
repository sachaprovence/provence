import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LeadDetailClient } from "@/components/lead/lead-detail-client";
import { getPipelineStages } from "@/lib/crm/pipeline-service";
import { getLeadTimeline } from "@/lib/crm/timeline-service";
import { listAttachments } from "@/lib/crm/attachment-service";
import { listContacts, listContactsForLead } from "@/lib/crm/contact-service";

async function getLead(id: string, organizationId: string) {
  return prisma.lead.findFirst({
    where: { id, organizationId },
    include: {
      contacts: true,
      notes: { include: { author: true }, orderBy: { createdAt: "desc" } },
      analyses: { orderBy: { createdAt: "desc" }, take: 1 },
      scores: { orderBy: { computedAt: "desc" }, take: 1 },
      messages: { orderBy: { createdAt: "desc" } },
      conversations: { orderBy: { createdAt: "desc" } },
      enrollments: { include: { sequence: true }, orderBy: { startedAt: "desc" } },
      appointments: { orderBy: { startAt: "desc" } },
      opportunities: { include: { quotes: { include: { lines: true } } }, orderBy: { createdAt: "desc" } },
      quotes: { include: { lines: true }, orderBy: { createdAt: "desc" } },
      tagsRelation: true,
      company: true,
      properties: { orderBy: { createdAt: "desc" } },
      virtualTours: { include: { mission: true }, orderBy: { createdAt: "desc" } },
      invoices: { orderBy: { createdAt: "desc" } },
      tasks: { orderBy: { createdAt: "desc" } },
    },
  });
}

export type LeadDetail = NonNullable<Awaited<ReturnType<typeof getLead>>>;

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const lead = await getLead(id, actor.organization.id);
  if (!lead) notFound();

  const [sequences, services, pipelineStages, allTags, timeline, attachments, contactLinks, allContacts] = await Promise.all([
    prisma.sequence.findMany({ where: { organizationId: actor.organization.id, isActive: true }, include: { steps: true } }),
    prisma.service.findMany({ where: { organizationId: actor.organization.id, isActive: true } }),
    getPipelineStages(actor.organization.id),
    prisma.tag.findMany({ where: { organizationId: actor.organization.id }, orderBy: { name: "asc" } }),
    getLeadTimeline(actor.organization.id, id),
    listAttachments(actor.organization.id, "Lead", id),
    listContactsForLead(actor.organization.id, id),
    listContacts(actor.organization.id),
  ]);

  return (
    <LeadDetailClient
      lead={lead}
      sequences={sequences}
      services={services}
      pipelineStages={pipelineStages}
      allTags={allTags}
      timeline={timeline}
      attachments={attachments}
      contactLinks={contactLinks}
      allContacts={allContacts}
      canValidate={actor.membership.role !== "PROVIDER"}
    />
  );
}
