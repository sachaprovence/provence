import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { companyCreateSchema } from "@/lib/validations/crm";
import { listCompanies, createCompany } from "@/lib/crm/company-service";
import { writeAuditLog } from "@/lib/audit";

export async function GET(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  try {
    const companies = await listCompanies(actor.organization.id);
    return NextResponse.json({ companies });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/companies" });
  }
}

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  try {
    const body = await request.json().catch(() => null);
    const parsed = companyCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
    }

    const company = await createCompany(actor.organization.id, parsed.data);
    await writeAuditLog({
      organizationId: actor.organization.id,
      userId: actor.user.id,
      action: "company.created",
      entityType: "Company",
      entityId: company.id,
    });

    return NextResponse.json({ company }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "POST /api/companies" });
  }
}
