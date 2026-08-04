import { z } from "zod";

export const invoiceStatusUpdateSchema = z.object({
  status: z.enum(["DRAFT", "SENT", "PAID", "OVERDUE", "CANCELLED"]),
});

// Paiements partiels (v1.1, AR-0169) — plusieurs paiements possibles par facture.
export const invoicePaymentCreateSchema = z.object({
  amount: z.coerce.number().int().min(1),
  paidAt: z.coerce.date().optional(),
  method: z.string().min(1).max(60),
  note: z.string().max(500).optional().nullable(),
});
