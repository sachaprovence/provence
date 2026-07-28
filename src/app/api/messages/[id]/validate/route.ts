import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { canValidateMessages } from "@/lib/permissions";
import { validateMessageSchema } from "@/lib/validations/message";
import { sendMessageNow } from "@/lib/sequence-engine";
import { writeAuditLog } from "@/lib/audit";
import { MessageStatus } from "@/generated/prisma/enums";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canValidateMessages(actor)) return NextResponse.json({ error: "Réservé aux commerciaux et administrateurs." }, { status: 403 });
  const { id } = await params;

  const message = await prisma.message.findFirst({
    where: { id, lead: { organizationId: actor.organization.id } },
    include: { lead: true },
  });
  if (!message) return NextResponse.json({ error: "Message introuvable." }, { status: 404 });
  if (message.status !== MessageStatus.PENDING_VALIDATION && message.status !== MessageStatus.DRAFT) {
    return NextResponse.json({ error: "Ce message a déjà été traité." }, { status: 409 });
  }

  const body = await request.json().catch(() => null);
  const parsed = validateMessageSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });

  if (!parsed.data.approve) {
    const rejected = await prisma.message.update({
      where: { id },
      data: { status: MessageStatus.REJECTED, validatedById: actor.user.id, validatedAt: new Date() },
    });
    await writeAuditLog({
      organizationId: actor.organization.id,
      userId: actor.user.id,
      leadId: message.leadId,
      action: "message.rejected",
      entityType: "Message",
      entityId: id,
    });
    return NextResponse.json({ message: rejected });
  }

  const updated = await prisma.message.update({
    where: { id },
    data: {
      subject: parsed.data.editedSubject ?? message.subject,
      body: parsed.data.editedBody ?? message.body,
      status: MessageStatus.APPROVED,
      validatedById: actor.user.id,
      validatedAt: new Date(),
    },
  });

  await writeAuditLog({
    organizationId: actor.organization.id,
    userId: actor.user.id,
    leadId: message.leadId,
    action: "message.approved",
    entityType: "Message",
    entityId: id,
  });

  await sendMessageNow(id);

  const finalMessage = await prisma.message.findUniqueOrThrow({ where: { id } });
  return NextResponse.json({ message: finalMessage });
}
