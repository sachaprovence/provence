import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse, requireSalesFeatureApi } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { enrollSchema } from "@/lib/validations/sequence";
import { enrollLeadInSequence, DuplicateEnrollmentError, SuppressedLeadError } from "@/lib/sequence-engine";
import { writeAuditLog } from "@/lib/audit";

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const forbiddenResp = requireSalesFeatureApi(actor);
  if (forbiddenResp) return forbiddenResp;

  const body = await request.json().catch(() => null);
  const parsed = enrollSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });

  const lead = await prisma.lead.findFirst({ where: { id: parsed.data.leadId, organizationId: actor.organization.id } });
  if (!lead) return NextResponse.json({ error: "Prospect introuvable." }, { status: 404 });

  const sequence = await prisma.sequence.findFirst({ where: { id: parsed.data.sequenceId, organizationId: actor.organization.id } });
  if (!sequence) return NextResponse.json({ error: "Séquence introuvable." }, { status: 404 });

  try {
    const enrollment = await enrollLeadInSequence(parsed.data);
    await writeAuditLog({
      organizationId: actor.organization.id,
      userId: actor.user.id,
      leadId: lead.id,
      action: "lead.enrolled",
      entityType: "Enrollment",
      entityId: enrollment.id,
      metadata: { sequenceId: sequence.id },
    });
    return NextResponse.json({ enrollment }, { status: 201 });
  } catch (err) {
    if (err instanceof SuppressedLeadError) return NextResponse.json({ error: err.message }, { status: 409 });
    if (err instanceof DuplicateEnrollmentError) return NextResponse.json({ error: err.message }, { status: 409 });
    throw err;
  }
}
