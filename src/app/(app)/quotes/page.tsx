import { requireActor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { QuotesClient } from "@/components/quotes-client";

export default async function QuotesPage() {
  const actor = await requireActor();
  const quotes = await prisma.quote.findMany({
    where: { organizationId: actor.organization.id },
    include: { lead: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-p360-ink">Devis</h1>
      <QuotesClient quotes={quotes} />
    </div>
  );
}
