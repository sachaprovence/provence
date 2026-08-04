import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withPublicApiHandler } from "@/lib/public-api/handler";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

/** Liste en lecture seule des factures de l'organisation propriétaire de la clé API (v1.0, AR-0059). */
export const GET = withPublicApiHandler(async (request, actor) => {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit")) || DEFAULT_LIMIT, MAX_LIMIT);

  const invoices = await prisma.invoice.findMany({
    where: { organizationId: actor.organizationId },
    take: limit,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      leadId: true,
      reference: true,
      status: true,
      totalAmount: true,
      vatAmount: true,
      dueAt: true,
      sentAt: true,
      paidAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ data: invoices });
});
