import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { MembershipRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

const STATUS_LABEL: Record<string, string> = { DRAFT: "Brouillon", ACTIVE: "Active", PAUSED: "En pause", COMPLETED: "Terminée" };

export default async function CampaignsPage() {
  const actor = await requireRole([MembershipRole.OWNER_ADMIN, MembershipRole.SALES]);
  const campaigns = await prisma.campaign.findMany({
    where: { organizationId: actor.organization.id },
    include: { sequence: true, _count: { select: { leads: true, enrollments: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-p360-ink">Campagnes</h1>
        <Link href="/campaigns/new" className="btn-primary">Nouvelle campagne</Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {campaigns.map((c) => (
          <Link key={c.id} href={`/campaigns/${c.id}`} className="card p-5 block hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-medium text-p360-ink">{c.name}</div>
                <div className="text-xs text-p360-muted mt-0.5">{c.sequence?.name ?? "Aucune séquence associée"}</div>
              </div>
              <span className="badge bg-p360-lavender-light text-p360-blue">{STATUS_LABEL[c.status]}</span>
            </div>
            <div className="text-sm text-p360-muted mt-3">{c._count.leads} prospect(s) — {c._count.enrollments} inscription(s)</div>
          </Link>
        ))}
        {campaigns.length === 0 && <p className="text-p360-muted">Aucune campagne pour le moment.</p>}
      </div>
    </div>
  );
}
