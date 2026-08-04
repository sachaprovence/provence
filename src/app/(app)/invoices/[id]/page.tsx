import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { getInvoice } from "@/lib/crm/invoice-service";
import { InvoiceDetailClient } from "@/components/invoice-detail-client";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;

  const invoice = await getInvoice(actor.organization.id, id).catch(() => null);
  if (!invoice) notFound();

  return <InvoiceDetailClient invoice={invoice} />;
}
