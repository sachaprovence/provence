import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { MembershipRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { CampaignDetailClient } from "@/components/campaign-detail-client";

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole([MembershipRole.OWNER_ADMIN, MembershipRole.SALES]);
  const { id } = await params;

  const campaign = await prisma.campaign.findFirst({
    where: { id, organizationId: actor.organization.id },
    include: {
      sequence: true,
      leads: { include: { scores: { orderBy: { computedAt: "desc" }, take: 1 } } },
      enrollments: true,
    },
  });
  if (!campaign) notFound();

  const availableLeads = await prisma.lead.findMany({
    where: { organizationId: actor.organization.id, campaignId: null, isSuppressed: false },
    include: { scores: { orderBy: { computedAt: "desc" }, take: 1 } },
    take: 100,
  });

  return <CampaignDetailClient campaign={campaign} availableLeads={availableLeads} />;
}
