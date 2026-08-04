import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import { withPublicApiHandlerParams } from "@/lib/public-api/handler";

/** Lecture d'un prospect par id, strictement scopée à l'organisation propriétaire de la clé API (v1.0, AR-0059). */
export const GET = withPublicApiHandlerParams<{ id: string }>(async (_request, actor, { id }) => {
  const lead = await prisma.lead.findFirst({ where: { id, organizationId: actor.organizationId } });
  if (!lead) throw new NotFoundError("Prospect introuvable.");
  return NextResponse.json({ data: lead });
});
