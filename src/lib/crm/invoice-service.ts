import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ConflictError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit";
import { publishAutomationEvent } from "@/lib/automation/triggers/event-dispatcher";
import { InvoiceStatus, QuoteStatus } from "@/generated/prisma/enums";

/**
 * Facturation (brief v0.9 : "Transformation en facture (préparer
 * l'architecture)") — conversion TOUJOURS explicite depuis un `Quote`
 * `ACCEPTED`, jamais automatique (voir ADR 0038). `Invoice`/`InvoiceLine`
 * sont des modèles séparés de `Quote`/`QuoteLine` : un cycle de vie propre
 * (DRAFT -> SENT -> PAID/OVERDUE/CANCELLED) distinct de celui d'un devis.
 */

const DEFAULT_PAYMENT_TERMS_DAYS = 30;

export async function listInvoices(organizationId: string, filters: { leadId?: string } = {}) {
  return prisma.invoice.findMany({
    where: { organizationId, leadId: filters.leadId || undefined },
    include: { lines: true, lead: { select: { id: true, establishmentName: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getInvoice(organizationId: string, id: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id, organizationId },
    include: { lines: true, lead: true, quote: true },
  });
  if (!invoice) throw new NotFoundError("Facture introuvable.");
  return invoice;
}

/** Convertit un devis ACCEPTED en facture DRAFT — jamais automatique, toujours une action explicite. */
export async function convertQuoteToInvoice(organizationId: string, quoteId: string, actorUserId: string) {
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, organizationId },
    include: { lines: true },
  });
  if (!quote) throw new NotFoundError("Devis introuvable.");
  if (quote.status !== QuoteStatus.ACCEPTED) {
    throw new ConflictError("Seul un devis accepté peut être transformé en facture.");
  }

  const existingInvoice = await prisma.invoice.findFirst({ where: { quoteId: quote.id } });
  if (existingInvoice) {
    throw new ConflictError("Ce devis a déjà été transformé en facture.");
  }

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const count = await prisma.invoice.count({ where: { organizationId } });
  const reference = `${organization.invoicePrefix ?? "FA"}-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + DEFAULT_PAYMENT_TERMS_DAYS);

  const invoice = await prisma.invoice.create({
    data: {
      organizationId,
      leadId: quote.leadId,
      quoteId: quote.id,
      reference,
      status: InvoiceStatus.DRAFT,
      totalAmount: quote.totalAmount,
      vatAmount: quote.vatAmount,
      dueAt,
      lines: {
        create: quote.lines.map((line) => ({
          serviceId: line.serviceId,
          label: line.label,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          vatRate: quote.vatRate,
        })),
      },
    },
    include: { lines: true },
  });

  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    leadId: quote.leadId,
    action: "invoice.created_from_quote",
    entityType: "Invoice",
    entityId: invoice.id,
    metadata: { quoteId: quote.id, totalAmount: invoice.totalAmount },
  });
  await publishAutomationEvent("invoice.created", { organizationId, leadId: quote.leadId, invoiceId: invoice.id });

  return invoice;
}

export async function updateInvoiceStatus(organizationId: string, id: string, status: InvoiceStatus) {
  const existing = await prisma.invoice.findFirst({ where: { id, organizationId } });
  if (!existing) throw new NotFoundError("Facture introuvable.");

  const invoice = await prisma.invoice.update({
    where: { id },
    data: {
      status,
      sentAt: status === InvoiceStatus.SENT ? new Date() : undefined,
      paidAt: status === InvoiceStatus.PAID ? new Date() : undefined,
    },
  });

  if (status === InvoiceStatus.SENT) {
    await publishAutomationEvent("invoice.sent", { organizationId, leadId: invoice.leadId, invoiceId: id });
  }
  if (status === InvoiceStatus.PAID) {
    await publishAutomationEvent("invoice.paid", { organizationId, leadId: invoice.leadId, invoiceId: id });
  }

  return invoice;
}
