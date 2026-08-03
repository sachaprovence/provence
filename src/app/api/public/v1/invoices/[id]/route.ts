import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import { withPublicApiHandlerParams } from "@/lib/public-api/handler";

/** Lecture d'une facture par id (avec ses lignes), strictement scopée à l'organisation propriétaire de la clé API (v1.0, AR-0059). */
export const GET = withPublicApiHandlerParams<{ id: string }>(async (_request, actor, { id }) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: { lines: true },
  });
  if (!invoice) throw new NotFoundError("Facture introuvable.");
  return NextResponse.json({ data: invoice });
});
