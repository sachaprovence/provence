import "server-only";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ConflictError, ValidationError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit";
import { publishAutomationEvent } from "@/lib/automation/triggers/event-dispatcher";
import { computeQuoteTotals, type QuoteLineInput } from "./quote-pricing";
import { getESignatureProvider } from "@/lib/quotes/esignature";
import { LeadStage, QuoteStatus, QuoteSignatureStatus } from "@/generated/prisma/enums";

/**
 * Service de devis (brief v0.9 : "Catalogue, Prestations, Remises, TVA,
 * PDF, Historique, Versionnement, Signature électronique") — étend le
 * `Quote`/`QuoteLine` existants (v0.1) sans changer leur sémantique déjà
 * utilisée ailleurs (`totalAmount` reste le TTC final). Un devis n'est
 * modifiable (lignes/remise/TVA) que tant qu'il est `DRAFT` : au-delà, il
 * est figé et versionné (voir `QuoteVersion`, `sendQuote`).
 */

export interface QuoteLineDraft {
  serviceId?: string | null;
  label: string;
  quantity: number;
  unitPrice: number;
}

function toPricingInput(lines: QuoteLineDraft[]): QuoteLineInput[] {
  return lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice }));
}

export async function getQuote(organizationId: string, id: string) {
  const quote = await prisma.quote.findFirst({
    where: { id, organizationId },
    include: { lines: true, lead: { select: { id: true, establishmentName: true } } },
  });
  if (!quote) throw new NotFoundError("Devis introuvable.");
  return quote;
}

/**
 * Historique des versions figées (v1.1, AR-0168) — `QuoteVersion` capture
 * déjà un instantané JSON à chaque passage `DRAFT`→`SENT` (`sendQuote()`
 * ci-dessous) mais n'était exposé par aucune route ni aucune UI jusqu'ici.
 */
export async function listQuoteVersions(organizationId: string, quoteId: string) {
  const quote = await prisma.quote.findFirst({ where: { id: quoteId, organizationId }, select: { id: true } });
  if (!quote) throw new NotFoundError("Devis introuvable.");
  return prisma.quoteVersion.findMany({ where: { quoteId, organizationId }, orderBy: { versionNumber: "asc" } });
}

export async function createQuote(
  organizationId: string,
  data: {
    leadId: string;
    opportunityId?: string | null;
    expiresAt?: Date | null;
    discountPercent?: number;
    vatRate?: number;
    lines: QuoteLineDraft[];
  }
) {
  const lead = await prisma.lead.findFirst({ where: { id: data.leadId, organizationId } });
  if (!lead) throw new ValidationError("Prospect introuvable.");

  const discountPercent = data.discountPercent ?? 0;
  const vatRate = data.vatRate ?? 20;
  const totals = computeQuoteTotals(toPricingInput(data.lines), discountPercent, vatRate);

  const count = await prisma.quote.count({ where: { organizationId } });
  const reference = `DEV-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

  return prisma.quote.create({
    data: {
      organizationId,
      leadId: lead.id,
      opportunityId: data.opportunityId || undefined,
      reference,
      expiresAt: data.expiresAt || undefined,
      discountPercent,
      vatRate,
      subtotalAmount: totals.subtotalAmount,
      vatAmount: totals.vatAmount,
      totalAmount: totals.totalAmount,
      lines: { create: data.lines },
    },
    include: { lines: true },
  });
}

async function requireDraftQuote(organizationId: string, id: string) {
  const quote = await prisma.quote.findFirst({ where: { id, organizationId }, include: { lines: true } });
  if (!quote) throw new NotFoundError("Devis introuvable.");
  if (quote.status !== QuoteStatus.DRAFT) {
    throw new ConflictError("Seul un devis à l'état brouillon peut être modifié.");
  }
  return quote;
}

/** Remplace intégralement les lignes/remise/TVA d'un devis — uniquement possible tant qu'il est DRAFT. */
export async function updateQuoteDraft(
  organizationId: string,
  id: string,
  data: { discountPercent?: number; vatRate?: number; expiresAt?: Date | null; lines?: QuoteLineDraft[] }
) {
  const existing = await requireDraftQuote(organizationId, id);

  const discountPercent = data.discountPercent ?? existing.discountPercent;
  const vatRate = data.vatRate ?? existing.vatRate;
  const lines = data.lines ?? existing.lines.map((l) => ({ serviceId: l.serviceId, label: l.label, quantity: l.quantity, unitPrice: l.unitPrice }));
  const totals = computeQuoteTotals(toPricingInput(lines), discountPercent, vatRate);

  return prisma.quote.update({
    where: { id },
    data: {
      discountPercent,
      vatRate,
      expiresAt: data.expiresAt === undefined ? undefined : data.expiresAt,
      subtotalAmount: totals.subtotalAmount,
      vatAmount: totals.vatAmount,
      totalAmount: totals.totalAmount,
      ...(data.lines ? { lines: { deleteMany: {}, create: data.lines } } : {}),
    },
    include: { lines: true },
  });
}

/**
 * Envoie le devis (DRAFT -> SENT) : fige un instantané immuable dans
 * `QuoteVersion` (brief : "Versionnement") avant tout changement ultérieur
 * possible sur une nouvelle version, et fait avancer `Lead.stage`.
 */
export async function sendQuote(organizationId: string, id: string, actorUserId: string) {
  const quote = await prisma.quote.findFirst({ where: { id, organizationId }, include: { lines: true } });
  if (!quote) throw new NotFoundError("Devis introuvable.");
  if (quote.status !== QuoteStatus.DRAFT) {
    throw new ConflictError("Seul un devis à l'état brouillon peut être envoyé.");
  }

  const versionCount = await prisma.quoteVersion.count({ where: { quoteId: id } });

  const [, , updated] = await prisma.$transaction([
    prisma.quoteVersion.create({
      data: {
        organizationId,
        quoteId: id,
        versionNumber: versionCount + 1,
        totalAmount: quote.totalAmount,
        snapshot: {
          reference: quote.reference,
          discountPercent: quote.discountPercent,
          vatRate: quote.vatRate,
          subtotalAmount: quote.subtotalAmount,
          vatAmount: quote.vatAmount,
          totalAmount: quote.totalAmount,
          lines: quote.lines.map((l) => ({ label: l.label, quantity: l.quantity, unitPrice: l.unitPrice })),
        },
      },
    }),
    prisma.lead.update({ where: { id: quote.leadId }, data: { stage: LeadStage.QUOTE_SENT } }),
    prisma.quote.update({ where: { id }, data: { status: QuoteStatus.SENT, sentAt: new Date() } }),
  ]);

  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    leadId: quote.leadId,
    action: "quote.sent",
    entityType: "Quote",
    entityId: id,
    metadata: { totalAmount: quote.totalAmount, versionNumber: versionCount + 1 },
  });
  await publishAutomationEvent("quote.sent", { organizationId, leadId: quote.leadId, quoteId: id });

  return updated;
}

/** Demande une signature électronique (abstraction, voir `esignature/`) — jamais pour un devis DRAFT. */
export async function requestQuoteSignature(
  organizationId: string,
  id: string,
  signer: { signerName: string; signerEmail: string }
) {
  const quote = await prisma.quote.findFirst({ where: { id, organizationId } });
  if (!quote) throw new NotFoundError("Devis introuvable.");
  if (quote.status === QuoteStatus.DRAFT) {
    throw new ConflictError("Le devis doit être envoyé avant de demander une signature.");
  }

  const provider = getESignatureProvider();
  const result = await provider.requestSignature({
    quoteId: id,
    organizationId,
    signerName: signer.signerName,
    signerEmail: signer.signerEmail,
  });

  return prisma.quote.update({
    where: { id },
    data: {
      signatureStatus: QuoteSignatureStatus.PENDING,
      signerName: signer.signerName,
      signerEmail: signer.signerEmail,
      signatureProvider: provider.name,
      signatureRequestId: result.providerRequestId,
    },
  });
}

/** Enregistre le résultat d'une signature (webhook fournisseur réel, ou action manuelle en mode démo). */
export async function recordSignatureResult(organizationId: string, id: string, status: "SIGNED" | "DECLINED") {
  const quote = await prisma.quote.findFirst({ where: { id, organizationId } });
  if (!quote) throw new NotFoundError("Devis introuvable.");
  if (quote.signatureStatus !== QuoteSignatureStatus.PENDING) {
    throw new ConflictError("Aucune signature en attente pour ce devis.");
  }

  const signatureStatus = status === "SIGNED" ? QuoteSignatureStatus.SIGNED : QuoteSignatureStatus.DECLINED;
  const updated = await prisma.quote.update({
    where: { id },
    data: {
      signatureStatus,
      signedAt: status === "SIGNED" ? new Date() : undefined,
      status: status === "SIGNED" ? QuoteStatus.ACCEPTED : QuoteStatus.DECLINED,
      acceptedAt: status === "SIGNED" ? new Date() : undefined,
    },
  });

  await publishAutomationEvent(status === "SIGNED" ? "quote.signed" : "quote.signature_declined", {
    organizationId,
    leadId: quote.leadId,
    quoteId: id,
  });

  return updated;
}
