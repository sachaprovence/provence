import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { isAdmin } from "@/lib/permissions";
import { companyUpdateSchema } from "@/lib/validations/crm";
import { getCompany, updateCompany, deleteCompany } from "@/lib/crm/company-service";
import { writeAuditLog } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  try {
    const company = await getCompany(actor.organization.id, id);
    return NextResponse.json({ company });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/companies/[id]" });
  }
}

export async function PUT(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  try {
    const body = await request.json().catch(() => null);
    const parsed = companyUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }

    const company = await updateCompany(actor.organization.id, id, parsed.data);
    await writeAuditLog({
      organizationId: actor.organization.id,
      userId: actor.user.id,
      action: "company.updated",
      entityType: "Company",
      entityId: company.id,
    });

    return NextResponse.json({ company });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "PUT /api/companies/[id]" });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!isAdmin(actor)) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });
  const { id } = await params;

  try {
    await deleteCompany(actor.organization.id, id);
    await writeAuditLog({
      organizationId: actor.organization.id,
      userId: actor.user.id,
      action: "company.deleted",
      entityType: "Company",
      entityId: id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "DELETE /api/companies/[id]" });
  }
}
