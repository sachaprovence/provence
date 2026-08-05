import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { listSales } from "@/lib/compta/sale-service";
import { ComptaSalesClient } from "@/components/compta-sales-client";

export default async function ComptaSalesPage() {
  const actor = await requireActor();
  const sales = await listSales(actor.organization.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-p360-ink">Ventes</h1>
        <Link href="/compta/ventes/nouvelle" className="btn-primary">Enregistrer une vente</Link>
      </div>
      <ComptaSalesClient sales={sales} />
    </div>
  );
}
