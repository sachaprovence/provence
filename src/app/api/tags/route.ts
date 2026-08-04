import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { tagCreateSchema } from "@/lib/validations/crm";
import { listTags, createTag } from "@/lib/crm/tag-service";
import { writeAuditLog } from "@/lib/audit";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  try {
    const tags = await listTags(actor.organization.id);
    return NextResponse.json({ tags });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/tags" });
  }
}

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  try {
    const body = await request.json().catch(() => null);
    const parsed = tagCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }

    const tag = await createTag(actor.organization.id, parsed.data);
    await writeAuditLog({
      organizationId: actor.organization.id,
      userId: actor.user.id,
      action: "tag.created",
      entityType: "Tag",
      entityId: tag.id,
    });

    return NextResponse.json({ tag }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/tags" });
  }
}
