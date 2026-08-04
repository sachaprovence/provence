import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { publishAutomationEvent } from "@/lib/automation/triggers/event-dispatcher";
import { InvoiceStatus } from "@/generated/prisma/enums";

/**
 * Bascule automatiquement `SENT` -> `OVERDUE` quand l'échéance est dépassée
 * sans paiement complet (v1.1, AR-0169) — même patron que
 * `process-sequences`/`process-webhook-deliveries` (job idempotent, rejouable,
 * déclenché par un vrai cron système). Ne touche jamais `DRAFT`/`PAID`/
 * `CANCELLED`/déjà `OVERDUE` : uniquement la transition SENT -> OVERDUE.
 */
export async function processOverdueInvoices(now: Date = new Date()) {
  const candidates = await prisma.invoice.findMany({
    where: { status: InvoiceStatus.SENT, dueAt: { lt: now } },
    include: { payments: true },
    take: 500,
  });

  let markedOverdue = 0;

  for (const invoice of candidates) {
    const paid = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
    if (paid >= invoice.totalAmount) continue; // soldée entre-temps — ne devrait déjà plus être SENT, sécurité supplémentaire.

    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: InvoiceStatus.OVERDUE } });
    logger.info({ module: "process-overdue-invoices", invoiceId: invoice.id, dueAt: invoice.dueAt }, "Facture passée en retard (échéance dépassée).");
    await publishAutomationEvent("invoice.overdue", { organizationId: invoice.organizationId, leadId: invoice.leadId, invoiceId: invoice.id });
    markedOverdue += 1;
  }

  return { checked: candidates.length, markedOverdue };
}
