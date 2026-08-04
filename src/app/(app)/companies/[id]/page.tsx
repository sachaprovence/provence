import { requireActor } from "@/lib/auth";
import { getCompany } from "@/lib/crm/company-service";
import { listContactsForCompany } from "@/lib/crm/contact-service";
import { CompanyDetailClient } from "@/components/company-detail-client";

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const [company, contactLinks] = await Promise.all([
    getCompany(actor.organization.id, id),
    listContactsForCompany(actor.organization.id, id),
  ]);

  return (
    <div className="max-w-4xl space-y-6">
      <CompanyDetailClient
        company={{
          id: company.id,
          name: company.name,
          legalName: company.legalName,
          siret: company.siret,
          website: company.website,
          address: company.address,
          city: company.city,
          country: company.country,
          notes: company.notes,
        }}
        leads={company.leads.map((l) => ({ id: l.id, establishmentName: l.establishmentName }))}
        properties={company.properties.map((p) => ({ id: p.id, label: p.label, city: p.city }))}
        contacts={contactLinks.map((link) => ({
          id: link.contact.id,
          fullName: link.contact.fullName,
          email: link.contact.email,
          phone: link.contact.phone,
          role: link.role,
        }))}
      />
    </div>
  );
}
