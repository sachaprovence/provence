import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { MembershipRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { SequenceBuilder } from "@/components/sequence-builder";
import { STAGE_LABEL } from "@/lib/labels";
import Link from "next/link";

export default async function SequenceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole([MembershipRole.OWNER_ADMIN, MembershipRole.SALES]);
  const { id } = await params;

  const sequence = await prisma.sequence.findFirst({
    where: { id, organizationId: actor.organization.id },
    include: {
      steps: { orderBy: { order: "asc" } },
      enrollments: { include: { lead: true }, orderBy: { startedAt: "desc" }, take: 50 },
    },
  });
  if (!sequence) notFound();

  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-2xl font-semibold text-p360-ink">{sequence.name}</h1>
      <SequenceBuilder
        sequenceId={sequence.id}
        initial={{
          name: sequence.name,
          description: sequence.description ?? "",
          isActive: sequence.isActive,
          steps: sequence.steps.map((s) => ({
            order: s.order,
            delayDays: s.delayDays,
            channel: s.channel,
            templateKey: s.templateKey,
            allowedStartHour: s.allowedStartHour,
            allowedEndHour: s.allowedEndHour,
            allowedWeekdays: s.allowedWeekdays,
            requiresValidation: s.requiresValidation,
          })),
        }}
      />

      <div className="card p-5">
        <h2 className="text-sm font-semibold text-p360-ink mb-3">Prospects inscrits</h2>
        <ul className="divide-y divide-p360-lavender-light text-sm">
          {sequence.enrollments.map((e) => (
            <li key={e.id} className="py-2 flex justify-between">
              <Link href={`/leads/${e.leadId}`} className="text-p360-blue hover:underline">{e.lead.establishmentName}</Link>
              <span className="text-p360-muted">{STAGE_LABEL[e.lead.stage]} — {e.status}</span>
            </li>
          ))}
          {sequence.enrollments.length === 0 && <li className="py-3 text-p360-muted">Aucun prospect inscrit.</li>}
        </ul>
      </div>
    </div>
  );
}
