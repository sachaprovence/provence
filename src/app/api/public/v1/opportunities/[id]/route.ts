import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import { withPublicApiHandlerParams } from "@/lib/public-api/handler";

/** Lecture d'une opportunité par id, strictement scopée à l'organisation propriétaire de la clé API (v1.0, AR-0059). */
export const GET = withPublicApiHandlerParams<{ id: string }>(async (_request, actor, { id }) => {
  const opportunity = await prisma.opportunity.findFirst({ where: { id, organizationId: actor.organizationId } });
  if (!opportunity) throw new NotFoundError("Opportunité introuvable.");
  return NextResponse.json({ data: opportunity });
});
