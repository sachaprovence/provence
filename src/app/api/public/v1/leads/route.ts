import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withPublicApiHandler } from "@/lib/public-api/handler";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

/** Liste en lecture seule des prospects de l'organisation propriétaire de la clé API (v1.0, AR-0059). */
export const GET = withPublicApiHandler(async (request, actor) => {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit")) || DEFAULT_LIMIT, MAX_LIMIT);

  const leads = await prisma.lead.findMany({
    where: { organizationId: actor.organizationId },
    take: limit,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      establishmentName: true,
      category: true,
      stage: true,
      city: true,
      region: true,
      websiteUrl: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ data: leads });
});
