import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { canManageOrganization } from "@/lib/permissions";
import { scoringRuleUpdateSchema } from "@/lib/validations/organization";
import { DEFAULT_SCORING_RULES } from "@/lib/scoring";

export async function GET() {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageOrganization(actor)) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: actor.organization.id } });
  const rules = organization.scoringRules ?? DEFAULT_SCORING_RULES;
  return NextResponse.json({ rules });
}

export async function PUT(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  if (!canManageOrganization(actor)) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = scoringRuleUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });

  const organization = await prisma.organization.update({
    where: { id: actor.organization.id },
    data: { scoringRules: parsed.data.rules },
  });
  return NextResponse.json({ rules: organization.scoringRules });
}
