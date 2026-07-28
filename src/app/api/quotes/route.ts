import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { quoteSchema } from "@/lib/validations/quote";
import { writeAuditLog } from "@/lib/audit";

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

  const count = await prisma.quote.count({ where: { organizationId: actor.organization.id } });
  const reference = `DEV-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
  const totalAmount = parsed.data.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

  const quote = await prisma.quote.create({
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
