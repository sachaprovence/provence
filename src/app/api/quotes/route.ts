import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { quoteSchema } from "@/lib/validations/quote";
import { writeAuditLog } from "@/lib/audit";
import { isUniqueConstraintError } from "@/lib/prisma-errors";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { searchParams } = new URL(request.url);
  const leadId = searchParams.get("leadId");

  const quotes = await prisma.quote.findMany({
    where: { organizationId: actor.organization.id, ...(leadId ? { leadId } : {}) },
    include: { lines: true, lead: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ quotes });
}

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const body = await request.json().catch(() => null);
  const parsed = quoteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });

  const lead = await prisma.lead.findFirst({ where: { id: parsed.data.leadId, organizationId: actor.organization.id } });
  if (!lead) return NextResponse.json({ error: "Prospect introuvable." }, { status: 404 });

  const totalAmount = parsed.data.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

  // La référence est dérivée d'un compteur : en cas de collision (deux créations
  // concurrentes), on relit le compteur et on retente plutôt que d'échouer.
  let quote;
  for (let attempt = 0; attempt < 5; attempt++) {
    const count = await prisma.quote.count({ where: { organizationId: actor.organization.id } });
    const reference = `DEV-${new Date().getFullYear()}-${String(count + 1 + attempt).padStart(4, "0")}`;
    try {
      quote = await prisma.quote.create({
        data: {
          organizationId: actor.organization.id,
          leadId: lead.id,
          opportunityId: parsed.data.opportunityId || undefined,
          reference,
          totalAmount,
          expiresAt: parsed.data.expiresAt || undefined,
          lines: { create: parsed.data.lines },
        },
        include: { lines: true },
      });
      break;
    } catch (err) {
      if (isUniqueConstraintError(err) && attempt < 4) continue;
      if (isUniqueConstraintError(err)) {
        return NextResponse.json({ error: "Impossible de générer une référence de devis unique, réessayez." }, { status: 409 });
      }
      throw err;
    }
  }
  if (!quote) {
    return NextResponse.json({ error: "Impossible de générer une référence de devis unique, réessayez." }, { status: 409 });
  }

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    leadId: lead.id,
    action: "quote.created",
    entityType: "Quote",
    entityId: quote.id,
    metadata: { totalAmount },
  });

  return NextResponse.json({ quote }, { status: 201 });
}
