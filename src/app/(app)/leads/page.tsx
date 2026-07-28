import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { MembershipRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { leadWhereForActor } from "@/lib/permissions";
import { STAGE_LABEL, CATEGORY_LABEL, STAGE_BADGE_CLASS, PIPELINE_STAGES } from "@/lib/labels";
import { ScoreBadge } from "@/components/score-badge";
import clsx from "clsx";

type SearchParams = { [key: string]: string | undefined };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requireRole([MembershipRole.OWNER_ADMIN, MembershipRole.SALES]);
  const sp = await searchParams;
  const view = sp.view === "kanban" ? "kanban" : "table";

  const leads = await prisma.lead.findMany({
    where: {
      ...leadWhereForActor(actor),
      ...(sp.stage ? { stage: sp.stage as never } : {}),
      ...(sp.category ? { category: sp.category as never } : {}),
      ...(sp.city ? { city: { equals: sp.city, mode: "insensitive" } } : {}),
      ...(sp.q
        ? { OR: [{ establishmentName: { contains: sp.q, mode: "insensitive" } }, { city: { contains: sp.q, mode: "insensitive" } }] }
        : {}),
    },
    include: { scores: { orderBy: { computedAt: "desc" }, take: 1 }, contacts: true },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  const minScore = sp.minScore ? Number(sp.minScore) : undefined;
  const filtered = minScore ? leads.filter((l) => (l.scores[0]?.value ?? 0) >= minScore) : leads;

  const cleanParams = (overrides: Partial<SearchParams>) => {
    const merged: Record<string, string> = {};
    for (const [k, v] of Object.entries({ ...sp, ...overrides })) {
      if (v) merged[k] = v;
    }
    return new URLSearchParams(merged).toString();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-p360-ink">Prospects</h1>
        <div className="flex gap-2">
          <Link href="/leads/import" className="btn-secondary">Importer un CSV</Link>
          <Link href="/leads/new" className="btn-primary">Ajouter un prospect</Link>
        </div>
      </div>

      <form className="card p-4 flex flex-wrap gap-3 items-end" method="get">
        <input type="hidden" name="view" value={view} />
        <div>
          <label className="label">Recherche</label>
          <input className="input" name="q" defaultValue={sp.q} placeholder="Nom, ville…" />
        </div>
        <div>
          <label className="label">Étape</label>
          <select className="input" name="stage" defaultValue={sp.stage ?? ""}>
            <option value="">Toutes</option>
            {PIPELINE_STAGES.map((s) => (
              <option key={s} value={s}>{STAGE_LABEL[s]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Catégorie</label>
          <select className="input" name="category" defaultValue={sp.category ?? ""}>
            <option value="">Toutes</option>
            {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Ville</label>
          <input className="input" name="city" defaultValue={sp.city} />
        </div>
        <div>
          <label className="label">Score minimum</label>
          <input className="input w-24" type="number" name="minScore" defaultValue={sp.minScore} min={0} max={100} />
        </div>
        <button type="submit" className="btn-secondary">Filtrer</button>
        <div className="ml-auto flex gap-1">
          <Link href={`/leads?${cleanParams({ view: "table" })}`} className={clsx("btn-secondary", view === "table" && "bg-p360-lavender-light")}>Tableau</Link>
          <Link href={`/leads?${cleanParams({ view: "kanban" })}`} className={clsx("btn-secondary", view === "kanban" && "bg-p360-lavender-light")}>Kanban</Link>
          <Link href="/map" className="btn-secondary">Carte</Link>
        </div>
      </form>

      <p className="text-sm text-p360-muted">{filtered.length} prospect(s)</p>

      {view === "table" ? (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-p360-lavender-light/40 text-p360-muted text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2">Établissement</th>
                <th className="text-left px-4 py-2">Catégorie</th>
                <th className="text-left px-4 py-2">Ville</th>
                <th className="text-left px-4 py-2">Étape</th>
                <th className="text-left px-4 py-2">Score</th>
                <th className="text-left px-4 py-2">Contact</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead) => (
                <tr key={lead.id} className="border-t border-p360-lavender-light hover:bg-p360-offwhite">
                  <td className="px-4 py-2">
                    <Link href={`/leads/${lead.id}`} className="text-p360-blue font-medium hover:underline">
                      {lead.establishmentName}
                    </Link>
                    {lead.isSuppressed && <span className="badge bg-red-50 text-p360-danger ml-2">désinscrit</span>}
                  </td>
                  <td className="px-4 py-2 text-p360-ink">{CATEGORY_LABEL[lead.category]}</td>
                  <td className="px-4 py-2 text-p360-ink">{lead.city ?? "—"}</td>
                  <td className="px-4 py-2">
                    <span className={clsx("badge", STAGE_BADGE_CLASS[lead.stage])}>{STAGE_LABEL[lead.stage]}</span>
                  </td>
                  <td className="px-4 py-2"><ScoreBadge value={lead.scores[0]?.value} /></td>
                  <td className="px-4 py-2 text-p360-muted">{lead.contacts[0]?.fullName ?? lead.contacts[0]?.email ?? "—"}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-p360-muted">Aucun prospect. Importez un CSV ou ajoutez-en un manuellement.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {PIPELINE_STAGES.map((stage) => {
            const stageLeads = filtered.filter((l) => l.stage === stage);
            if (stageLeads.length === 0) return null;
            return (
              <div key={stage} className="w-64 shrink-0">
                <div className="text-xs font-semibold text-p360-muted mb-2 px-1">
                  {STAGE_LABEL[stage]} ({stageLeads.length})
                </div>
                <div className="space-y-2">
                  {stageLeads.map((lead) => (
                    <Link key={lead.id} href={`/leads/${lead.id}`} className="card p-3 block hover:shadow-md transition-shadow">
                      <div className="text-sm font-medium text-p360-ink">{lead.establishmentName}</div>
                      <div className="text-xs text-p360-muted mt-0.5">{lead.city ?? "—"}</div>
                      <div className="mt-2"><ScoreBadge value={lead.scores[0]?.value} /></div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
