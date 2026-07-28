import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function SequencesPage() {
  const actor = await requireActor();
  const sequences = await prisma.sequence.findMany({
    where: { organizationId: actor.organization.id },
    include: { steps: { orderBy: { order: "asc" } }, _count: { select: { enrollments: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-p360-ink">Séquences</h1>
        <Link href="/sequences/new" className="btn-primary">Nouvelle séquence</Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sequences.map((s) => (
          <Link key={s.id} href={`/sequences/${s.id}`} className="card p-5 block hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
              <div className="font-medium text-p360-ink">{s.name}</div>
              <span className={`badge ${s.isActive ? "bg-green-50 text-p360-success" : "bg-gray-100 text-gray-500"}`}>{s.isActive ? "Active" : "Inactive"}</span>
            </div>
            <p className="text-xs text-p360-muted mt-1">{s.description}</p>
            <div className="text-sm text-p360-muted mt-3">
              {s.steps.map((step) => `J+${step.delayDays}`).join(" · ")} — {s._count.enrollments} inscription(s)
            </div>
          </Link>
        ))}
        {sequences.length === 0 && <p className="text-p360-muted">Aucune séquence. Créez-en une pour automatiser vos relances.</p>}
      </div>
    </div>
  );
}
