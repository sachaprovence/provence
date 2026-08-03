import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LeadDetailClient } from "@/components/lead/lead-detail-client";
import { getPipelineStages } from "@/lib/crm/pipeline-service";

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
    },
  });
}

export type LeadDetail = NonNullable<Awaited<ReturnType<typeof getLead>>>;

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const lead = await getLead(id, actor.organization.id);
  if (!lead) notFound();

  const [sequences, services, pipelineStages] = await Promise.all([
    prisma.sequence.findMany({ where: { organizationId: actor.organization.id, isActive: true }, include: { steps: true } }),
    prisma.service.findMany({ where: { organizationId: actor.organization.id, isActive: true } }),
    getPipelineStages(actor.organization.id),
  ]);

  return (
    <LeadDetailClient
      lead={lead}
      sequences={sequences}
      services={services}
      pipelineStages={pipelineStages}
      canValidate={actor.membership.role !== "PROVIDER"}
    />
  );
}
