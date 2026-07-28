import { prisma } from "@/lib/prisma";

export function defaultStatsRange(days = 90) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from, to };
}

export async function getOrgStats(organizationId: string, from: Date, to: Date) {
  const dateRange = { gte: from, lte: to };

  const [
    newLeads,
    qualifiedLeads,
    contactedLeads,
    repliedConversations,
    positiveReplies,
    appointments,
    quotesSent,
    customersWon,
    messagesSent,
    wonOpportunities,
  ] = await Promise.all([
    prisma.lead.count({ where: { organizationId, createdAt: dateRange } }),
    prisma.lead.count({ where: { organizationId, stage: { not: "NEW" }, createdAt: dateRange } }),
    prisma.message.count({ where: { lead: { organizationId }, status: "SENT", sentAt: dateRange } }),
    prisma.conversation.count({ where: { lead: { organizationId }, direction: "inbound", createdAt: dateRange } }),
    prisma.conversation.count({ where: { lead: { organizationId }, intent: "INTERESTED", createdAt: dateRange } }),
    prisma.appointment.count({ where: { organizationId, createdAt: dateRange } }),
    prisma.quote.count({ where: { organizationId, status: { in: ["SENT", "ACCEPTED"] }, sentAt: dateRange } }),
    prisma.customer.count({ where: { organizationId, wonAt: dateRange } }),
    prisma.message.count({ where: { lead: { organizationId }, status: "SENT", sentAt: dateRange } }),
    prisma.opportunity.findMany({ where: { organizationId, status: "WON", updatedAt: dateRange }, select: { estimatedValue: true } }),
  ]);

  const revenueGenerated = wonOpportunities.reduce((sum, o) => sum + o.estimatedValue, 0);
  const responseRate = messagesSent > 0 ? repliedConversations / messagesSent : 0;
  const appointmentRate = repliedConversations > 0 ? appointments / repliedConversations : 0;
  const conversionRate = newLeads > 0 ? customersWon / newLeads : 0;
  const avgCustomerValue = customersWon > 0 ? revenueGenerated / customersWon : 0;

  const [byCity, byCategory, byCampaign, byCommercial, stagePipeline] = await Promise.all([
    prisma.lead.groupBy({ by: ["city"], where: { organizationId, city: { not: null } }, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ["category"], where: { organizationId }, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ["campaignId"], where: { organizationId, campaignId: { not: null } }, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ["assignedToId"], where: { organizationId, assignedToId: { not: null } }, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ["stage"], where: { organizationId }, _count: { _all: true } }),
  ]);

  return {
    kpis: {
      newLeads,
      qualifiedLeads,
      contactedLeads,
      repliedConversations,
      positiveReplies,
      appointments,
      quotesSent,
      customersWon,
      revenueGenerated,
      responseRate,
      appointmentRate,
      conversionRate,
      avgCustomerValue,
    },
    breakdown: {
      byCity: byCity.map((c) => ({ city: c.city as string, count: c._count._all })),
      byCategory: byCategory.map((c) => ({ category: c.category, count: c._count._all })),
      byCampaign: byCampaign.map((c) => ({ campaignId: c.campaignId as string, count: c._count._all })),
      byCommercial: byCommercial.map((c) => ({ userId: c.assignedToId as string, count: c._count._all })),
    },
    pipeline: stagePipeline.map((s) => ({ stage: s.stage, count: s._count._all })),
  };
}
