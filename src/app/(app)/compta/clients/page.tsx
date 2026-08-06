import { requireActor } from "@/lib/auth";
import { listCustomers } from "@/lib/compta/customer-service";
import { ComptaCustomersClient } from "@/components/compta-customers-client";

export default async function ComptaCustomersPage() {
  const actor = await requireActor();
  const customers = await listCustomers(actor.organization.id);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-p360-ink">Clients</h1>
      <ComptaCustomersClient customers={customers} />
    </div>
  );
}
