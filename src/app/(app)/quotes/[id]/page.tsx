import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { getQuote, listQuoteVersions } from "@/lib/crm/quote-service";
import { QuoteDetailClient } from "@/components/quote-detail-client";

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;

  const quote = await getQuote(actor.organization.id, id).catch(() => null);
  if (!quote) notFound();

  const versions = await listQuoteVersions(actor.organization.id, id);

  return <QuoteDetailClient quote={quote} versions={versions} />;
}
