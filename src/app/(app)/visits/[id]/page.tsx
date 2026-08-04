import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getVirtualTour } from "@/lib/production/virtual-tour-service";
import { listAttachments } from "@/lib/crm/attachment-service";
import { VirtualTourDetailClient } from "@/components/virtual-tour-detail-client";

export default async function VirtualTourDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;

  const tour = await getVirtualTour(actor.organization.id, id).catch(() => null);
  if (!tour) notFound();

  const [attachments, services] = await Promise.all([
    listAttachments(actor.organization.id, "VirtualTour", id),
    prisma.service.findMany({ where: { organizationId: actor.organization.id, isActive: true } }),
  ]);

  return <VirtualTourDetailClient tour={tour} attachments={attachments} services={services} />;
}
