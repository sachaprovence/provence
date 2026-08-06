import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { comptaExpenseUpdateSchema } from "@/lib/validations/compta";
import { getExpense, updateExpense, deleteExpense } from "@/lib/compta/expense-service";
import { canManageComptaFinance, comptaForbiddenResponse } from "@/lib/compta/permissions";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const { id } = await params;

  try {
    const expense = await getExpense(actor.organization.id, id);
    return NextResponse.json({ expense });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "GET /api/compta/expenses/[id]" });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageComptaFinance(actor.membership.role)) return comptaForbiddenResponse();
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = comptaExpenseUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const expense = await updateExpense(actor.organization.id, id, parsed.data, actor.user.id);
    return NextResponse.json({ expense });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "PATCH /api/compta/expenses/[id]" });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageComptaFinance(actor.membership.role)) return comptaForbiddenResponse();
  const { id } = await params;

  try {
    await deleteExpense(actor.organization.id, id, actor.user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return toApiErrorResponse(error, request, { route: "DELETE /api/compta/expenses/[id]" });
  }
}
