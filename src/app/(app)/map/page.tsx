import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { MembershipRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { CATEGORY_LABEL, STAGE_BADGE_CLASS, STAGE_LABEL } from "@/lib/labels";
import { ScoreBadge } from "@/components/score-badge";
import clsx from "clsx";

type SearchParams = { category?: string; stage?: string };

export default async function MapPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requireRole([MembershipRole.OWNER_ADMIN, MembershipRole.SALES]);
  const sp = await searchParams;

  const [leads, territories] = await Promise.all([
    prisma.lead.findMany({
      where: {
        organizationId: actor.organization.id,
        ...(sp.category ? { category: sp.category as never } : {}),
        ...(sp.stage ? { stage: sp.stage as never } : {}),
      },
      include: { scores: { orderBy: { computedAt: "desc" }, take: 1 }, territory: true },
    }),
    prisma.territory.findMany({ where: { organizationId: actor.organization.id }, include: { _count: { select: { providers: true, missions: true } } } }),
  ]);

  const byTerritory = new Map<string, typeof leads>();
  const noTerritory: typeof leads = [];
  for (const lead of leads) {
    if (lead.territoryId) {
      const arr = byTerritory.get(lead.territoryId) ?? [];
      arr.push(lead);
      byTerritory.set(lead.territoryId, arr);
    } else {
      noTerritory.push(lead);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-p360-ink">Carte des prospects</h1>
        <p className="text-sm text-p360-muted mt-1">
          Regroupement par territoire (Avignon, Monteux, Carpentras, Orange, Cavaillon, Aix-en-Provence, Marseille…).
          Une carte interactive (Mapbox/Leaflet) pourra être branchée en remplacement de cette vue liste — voir la roadmap post-MVP.
        </p>
      </div>

      <form method="get" className="card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">Catégorie</label>
          <select className="input" name="category" defaultValue={sp.category ?? ""}>
            <option value="">Toutes</option>
            {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Étape</label>
          <select className="input" name="stage" defaultValue={sp.stage ?? ""}>
            <option value="">Toutes</option>
            {Object.entries(STAGE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <button type="submit" className="btn-secondary">Filtrer</button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {territories.map((t) => {
          const territoryLeads = (byTerritory.get(t.id) ?? []).sort((a, b) => (b.scores[0]?.value ?? 0) - (a.scores[0]?.value ?? 0));
          return (
            <div key={t.id} className="card p-4">
              <div className="flex justify-between items-center mb-2">
                <h2 className="font-medium text-p360-ink">{t.name}</h2>
                <span className="text-xs text-p360-muted">{t._count.providers} prestataire(s) — {t._count.missions} mission(s)</span>
              </div>
              <ul className="space-y-1.5 max-h-72 overflow-y-auto">
                {territoryLeads.map((lead) => (
                  <li key={lead.id}>
                    <Link href={`/leads/${lead.id}`} className="flex items-center justify-between text-sm hover:bg-p360-offwhite rounded px-1.5 py-1">
                      <span className="text-p360-ink truncate">{lead.establishmentName}</span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        <span className={clsx("badge text-[10px]", STAGE_BADGE_CLASS[lead.stage])}>{STAGE_LABEL[lead.stage]}</span>
                        <ScoreBadge value={lead.scores[0]?.value} />
                      </span>
                    </Link>
                  </li>
                ))}
                {territoryLeads.length === 0 && <li className="text-xs text-p360-muted px-1.5">Aucun prospect dans ce territoire.</li>}
              </ul>
            </div>
          );
        })}
      </div>

      {noTerritory.length > 0 && (
        <div className="card p-4">
          <h2 className="font-medium text-p360-ink mb-2">Sans territoire assigné</h2>
          <ul className="space-y-1.5">
            {noTerritory.map((lead) => (
              <li key={lead.id}>
                <Link href={`/leads/${lead.id}`} className="flex items-center justify-between text-sm hover:bg-p360-offwhite rounded px-1.5 py-1">
                  <span className="text-p360-ink">{lead.establishmentName} {lead.city ? `— ${lead.city}` : ""}</span>
                  <ScoreBadge value={lead.scores[0]?.value} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
