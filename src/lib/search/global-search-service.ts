import "server-only";
import { prisma } from "@/lib/prisma";
import { CATEGORY_LABEL, VIRTUAL_TOUR_STATUS_LABEL } from "@/lib/labels";

/**
 * Recherche globale (v1.1, AR-0181) — aucune recherche transverse
 * n'existait jusqu'ici (chaque liste — prospects, devis, factures — a son
 * propre filtre local). Interroge prospects/entreprises/contacts/devis/
 * factures/visites en une seule requête, chaque sous-requête SCOPÉE par
 * organisation (jamais de fuite inter-tenant), résultats groupés par type.
 * Réutilisé tel quel par la Command Palette (`AR-0182`).
 */

export interface SearchResultItem {
  id: string;
  label: string;
  subtitle?: string;
  href: string;
}

export interface GlobalSearchResults {
  leads: SearchResultItem[];
  companies: SearchResultItem[];
  contacts: SearchResultItem[];
  quotes: SearchResultItem[];
  invoices: SearchResultItem[];
  virtualTours: SearchResultItem[];
}

const RESULT_LIMIT_PER_TYPE = 5;
const EMPTY_RESULTS: GlobalSearchResults = { leads: [], companies: [], contacts: [], quotes: [], invoices: [], virtualTours: [] };

function formatEuros(cents: number) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

export async function globalSearch(organizationId: string, rawQuery: string): Promise<GlobalSearchResults> {
  const query = rawQuery.trim();
  if (query.length < 2) return EMPTY_RESULTS;

  const [leads, companies, contacts, quotes, invoices, virtualTours] = await Promise.all([
    prisma.lead.findMany({
      where: { organizationId, establishmentName: { contains: query, mode: "insensitive" } },
      take: RESULT_LIMIT_PER_TYPE,
      select: { id: true, establishmentName: true, category: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.company.findMany({
      where: { organizationId, name: { contains: query, mode: "insensitive" } },
      take: RESULT_LIMIT_PER_TYPE,
      select: { id: true, name: true, city: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.contact.findMany({
      where: {
        organizationId,
        OR: [{ fullName: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } }],
      },
      take: RESULT_LIMIT_PER_TYPE,
      select: {
        id: true,
        fullName: true,
        email: true,
        leadLinks: { take: 1, select: { leadId: true } },
        companyLinks: { take: 1, select: { companyId: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.quote.findMany({
      where: { organizationId, reference: { contains: query, mode: "insensitive" } },
      take: RESULT_LIMIT_PER_TYPE,
      select: { id: true, reference: true, totalAmount: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.invoice.findMany({
      where: { organizationId, reference: { contains: query, mode: "insensitive" } },
      take: RESULT_LIMIT_PER_TYPE,
      select: { id: true, reference: true, totalAmount: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.virtualTour.findMany({
      where: { organizationId, lead: { establishmentName: { contains: query, mode: "insensitive" } } },
      take: RESULT_LIMIT_PER_TYPE,
      select: { id: true, status: true, lead: { select: { establishmentName: true } } },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return {
    leads: leads.map((lead) => ({
      id: lead.id,
      label: lead.establishmentName,
      subtitle: CATEGORY_LABEL[lead.category] ?? lead.category,
      href: `/leads/${lead.id}`,
    })),
    companies: companies.map((company) => ({ id: company.id, label: company.name, subtitle: company.city ?? undefined, href: `/companies/${company.id}` })),
    contacts: contacts.map((contact) => {
      const leadId = contact.leadLinks[0]?.leadId;
      const companyId = contact.companyLinks[0]?.companyId;
      return {
        id: contact.id,
        label: contact.fullName,
        subtitle: contact.email ?? undefined,
        href: leadId ? `/leads/${leadId}` : companyId ? `/companies/${companyId}` : "#",
      };
    }),
    quotes: quotes.map((quote) => ({ id: quote.id, label: quote.reference, subtitle: formatEuros(quote.totalAmount), href: `/quotes/${quote.id}` })),
    invoices: invoices.map((invoice) => ({ id: invoice.id, label: invoice.reference, subtitle: formatEuros(invoice.totalAmount), href: `/invoices/${invoice.id}` })),
    virtualTours: virtualTours.map((tour) => ({
      id: tour.id,
      label: tour.lead.establishmentName,
      subtitle: VIRTUAL_TOUR_STATUS_LABEL[tour.status] ?? tour.status,
      href: `/visits/${tour.id}`,
    })),
  };
}
