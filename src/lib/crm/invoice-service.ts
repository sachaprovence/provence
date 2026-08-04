import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ConflictError, ValidationError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit";
import { publishAutomationEvent } from "@/lib/automation/triggers/event-dispatcher";
import { InvoiceStatus, QuoteStatus } from "@/generated/prisma/enums";
import type { invoicePaymentCreateSchema } from "@/lib/validations/invoice";
import type { z } from "zod";

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
    include: { lines: true, lead: true, quote: true, payments: { orderBy: { paidAt: "desc" } } },
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

/**
 * Facture directement depuis une visite 3D (v1.1, AR-0167) — toujours une
 * action explicite (bouton "Créer la facture"), jamais automatique, même
 * principe que `convertQuoteToInvoice`. Pré-remplit une unique ligne à
 * partir du `Service` choisi (la visite n'a pas de Service directement lié
 * en base — l'opérateur le choisit, comme pour un devis, voir
 * `OpportunitiesPanel`). Rejette si la visite a déjà une facture liée.
 */
export async function createInvoiceFromVirtualTour(organizationId: string, virtualTourId: string, serviceId: string, actorUserId: string) {
  const tour = await prisma.virtualTour.findFirst({ where: { id: virtualTourId, organizationId } });
  if (!tour) throw new NotFoundError("Visite 3D introuvable.");
  if (tour.invoiceId) throw new ConflictError("Cette visite a déjà une facture liée.");

  const service = await prisma.service.findFirst({ where: { id: serviceId, organizationId } });
  if (!service) throw new NotFoundError("Prestation introuvable.");

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const count = await prisma.invoice.count({ where: { organizationId } });
  const reference = `${organization.invoicePrefix ?? "FA"}-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + DEFAULT_PAYMENT_TERMS_DAYS);

  const invoice = await prisma.invoice.create({
    data: {
      organizationId,
      leadId: tour.leadId,
      reference,
      status: InvoiceStatus.DRAFT,
      totalAmount: service.basePrice,
      vatAmount: 0,
      dueAt,
      lines: { create: [{ serviceId: service.id, label: service.name, quantity: 1, unitPrice: service.basePrice }] },
      virtualTours: { connect: { id: tour.id } },
    },
    include: { lines: true },
  });

  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    leadId: tour.leadId,
    action: "invoice.created_from_virtual_tour",
    entityType: "Invoice",
    entityId: invoice.id,
    metadata: { virtualTourId: tour.id, totalAmount: invoice.totalAmount },
  });
  await publishAutomationEvent("invoice.created", { organizationId, leadId: tour.leadId, invoiceId: invoice.id });

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

export async function listInvoicePayments(organizationId: string, invoiceId: string) {
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, organizationId }, select: { id: true } });
  if (!invoice) throw new NotFoundError("Facture introuvable.");
  return prisma.invoicePayment.findMany({ where: { invoiceId, organizationId }, orderBy: { paidAt: "desc" } });
}

/**
 * Enregistre un paiement, partiel ou complet (v1.1, AR-0169) — `InvoiceStatus`
 * reste binaire côté affichage : le statut passe à `PAID` (et `invoice.paid`
 * n'est publié) que lorsque la SOMME des paiements atteint `totalAmount`,
 * jamais sur un seul paiement partiel. Rejette un paiement sur une facture
 * déjà soldée ou annulée (jamais de sur-paiement silencieux).
 */
export async function recordInvoicePayment(
  organizationId: string,
  invoiceId: string,
  data: z.infer<typeof invoicePaymentCreateSchema>,
  actorUserId: string
) {
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, organizationId }, include: { payments: true } });
  if (!invoice) throw new NotFoundError("Facture introuvable.");
  if (invoice.status === InvoiceStatus.PAID) throw new ConflictError("Cette facture est déjà entièrement payée.");
  if (invoice.status === InvoiceStatus.CANCELLED) throw new ConflictError("Cette facture est annulée.");

  const alreadyPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
  if (alreadyPaid + data.amount > invoice.totalAmount) {
    throw new ValidationError(
      `Le paiement dépasse le solde restant dû (${((invoice.totalAmount - alreadyPaid) / 100).toFixed(2)} €).`
    );
  }

  const payment = await prisma.invoicePayment.create({
    data: {
      organizationId,
      invoiceId,
      amount: data.amount,
      paidAt: data.paidAt ?? new Date(),
      method: data.method,
      note: data.note || undefined,
    },
  });

  const totalPaid = alreadyPaid + data.amount;
  const newlyPaidInFull = totalPaid >= invoice.totalAmount;

  if (newlyPaidInFull) {
    await prisma.invoice.update({ where: { id: invoiceId }, data: { status: InvoiceStatus.PAID, paidAt: new Date() } });
  }

  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    leadId: invoice.leadId,
    action: "invoice.payment_recorded",
    entityType: "Invoice",
    entityId: invoiceId,
    metadata: { paymentId: payment.id, amount: data.amount, totalPaid },
  });

  if (newlyPaidInFull) {
    await publishAutomationEvent("invoice.paid", { organizationId, leadId: invoice.leadId, invoiceId });
  }

  return payment;
}
