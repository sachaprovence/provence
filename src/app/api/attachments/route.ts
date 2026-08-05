import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { attachmentCreateSchema } from "@/lib/validations/crm";
import { listAttachments, createAttachment } from "@/lib/crm/attachment-service";
import { writeAuditLog } from "@/lib/audit";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");
  if (!entityType || !entityId) {
    return NextResponse.json({ error: "Paramètres entityType et entityId requis." }, { status: 400 });
  }

  try {
    const attachments = await listAttachments(actor.organization.id, entityType, entityId);
    return NextResponse.json({ attachments });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/attachments" });
  }
}

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  try {
    const body = await request.json().catch(() => null);
    const parsed = attachmentCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }

    const attachment = await createAttachment(actor.organization.id, actor.user.id, parsed.data);
    await writeAuditLog({
      organizationId: actor.organization.id,
      userId: actor.user.id,
      action: "attachment.created",
      entityType: attachment.entityType,
      entityId: attachment.entityId,
      metadata: { attachmentId: attachment.id, category: attachment.category },
    });

    return NextResponse.json({ attachment }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/attachments" });
  }
}
