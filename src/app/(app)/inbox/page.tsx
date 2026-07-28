import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { MembershipRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { INTENT_LABEL } from "@/lib/labels";

export default async function InboxPage() {
  const actor = await requireRole([MembershipRole.OWNER_ADMIN, MembershipRole.SALES]);
  const conversations = await prisma.conversation.findMany({
    where: { lead: { organizationId: actor.organization.id }, direction: "inbound" },
    include: { lead: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-p360-ink">Boîte de réception</h1>
      <p className="text-sm text-p360-muted">
        Réponses reçues, associées automatiquement au prospect concerné et classées par intention.
      </p>
      <div className="space-y-3">
        {conversations.map((c) => (
          <Link key={c.id} href={`/leads/${c.leadId}`} className="card p-4 block hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-p360-ink">{c.lead.establishmentName}</span>
              {c.intent && <span className="badge bg-p360-lavender-light text-p360-blue">{INTENT_LABEL[c.intent] ?? c.intent}</span>}
            </div>
            <p className="text-sm text-p360-ink line-clamp-2">{c.body}</p>
            <div className="text-xs text-p360-muted mt-1">{new Date(c.createdAt).toLocaleString("fr-FR")}</div>
          </Link>
        ))}
        {conversations.length === 0 && <p className="text-p360-muted">Aucune réponse reçue pour le moment.</p>}
      </div>
    </div>
  );
}
