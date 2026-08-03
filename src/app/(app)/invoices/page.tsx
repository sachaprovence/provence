import { requireActor } from "@/lib/auth";
import { listInvoices } from "@/lib/crm/invoice-service";
import { InvoicesClient } from "@/components/invoices-client";

export default async function InvoicesPage() {
  const actor = await requireActor();
  const invoices = await listInvoices(actor.organization.id);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-p360-ink">Factures</h1>
      <InvoicesClient invoices={invoices} />
    </div>
  );
}
