import { requireActor } from "@/lib/auth";
import { listSuppliers } from "@/lib/compta/supplier-service";
import { ComptaSuppliersClient } from "@/components/compta-suppliers-client";

export default async function ComptaSuppliersPage() {
  const actor = await requireActor();
  const suppliers = await listSuppliers(actor.organization.id);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-p360-ink">Fournisseurs</h1>
      <ComptaSuppliersClient suppliers={suppliers} />
    </div>
  );
}
