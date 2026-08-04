import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse, forbidden } from "@/lib/api-helpers";
import { canManageOrganization } from "@/lib/permissions";
import { listApiKeys, createApiKey } from "@/lib/settings/api-keys-service";
import { toApiErrorResponse } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit";

export async function GET() {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageOrganization(actor)) return forbidden();

  const apiKeys = await listApiKeys(actor.organization.id);
  return NextResponse.json({ apiKeys });
}

/** Crée une nouvelle clé API — la valeur en clair n'est renvoyée qu'une seule fois, dans cette réponse. */
export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageOrganization(actor)) return forbidden();

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name : "";

  try {
    const { rawKey, preview } = await createApiKey({ organizationId: actor.organization.id, name, createdById: actor.user.id });
    await writeAuditLog({
      organizationId: actor.organization.id,
      userId: actor.user.id,
      action: "api_key.created",
      entityType: "ApiKey",
      entityId: preview.id,
      metadata: { name: preview.name },
    });
    return NextResponse.json({ rawKey, apiKey: preview }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, { route: "POST /api/settings/api-keys" });
  }
}
