import { requireActor } from "@/lib/auth";
import { listCompanies } from "@/lib/crm/company-service";
import { CompaniesClient } from "@/components/companies-client";

/** Interface Entreprises (v1.1, AR-0161) — le service/l'API existent depuis v0.9 mais n'avaient aucune page. */
export default async function CompaniesPage() {
  const actor = await requireActor();
  const companies = await listCompanies(actor.organization.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-p360-ink">Entreprises</h1>
        <p className="text-sm text-p360-muted mt-1">
          Regroupement optionnel de plusieurs prospects/clients sous une même entité juridique (groupe hôtelier, réseau d&apos;agences...).
        </p>
      </div>
      <CompaniesClient
        companies={companies.map((c) => ({
          id: c.id,
          name: c.name,
          legalName: c.legalName,
          city: c.city,
          leadCount: c._count.leads,
          propertyCount: c._count.properties,
        }))}
      />
    </div>
  );
}
