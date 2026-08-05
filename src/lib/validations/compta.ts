import { z } from "zod";

export const comptaProductSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  price: z.coerce.number().int().min(0),
  vatRate: z.coerce.number().min(0).max(100).default(10),
  costPrice: z.coerce.number().int().min(0).optional().nullable(),
  aliases: z.array(z.string().min(1).max(100)).default([]),
  isActive: z.coerce.boolean().default(true),
});

export const comptaProductUpdateSchema = comptaProductSchema.partial();

export const comptaSaleLineSchema = z.object({
  productId: z.string().optional().nullable(),
  productName: z.string().min(1).max(200),
  quantity: z.coerce.number().int().min(1).default(1),
  unitPrice: z.coerce.number().int().min(0),
  vatRate: z.coerce.number().min(0).max(100),
});

export const comptaSaleSchema = z.object({
  soldAt: z.coerce.date(),
  paymentMethod: z.enum(["CASH", "CARD", "TRANSFER", "OTHER"]),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  notes: z.string().max(2000).optional().nullable(),
  lines: z.array(comptaSaleLineSchema).min(1),
});

export const comptaSupplierSchema = z.object({
  name: z.string().min(1).max(200),
  contactName: z.string().max(200).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().max(40).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  balanceDue: z.coerce.number().int().min(0).default(0),
});

export const comptaSupplierUpdateSchema = comptaSupplierSchema.partial();

export const comptaExpenseSchema = z.object({
  spentAt: z.coerce.date(),
  amount: z.coerce.number().int().min(1),
  vatRate: z.coerce.number().min(0).max(100).default(20),
  category: z.enum(["INGREDIENTS", "RENT", "UTILITIES", "SALARIES", "EQUIPMENT", "MARKETING", "TAXES", "OTHER"]).default("OTHER"),
  description: z.string().min(1).max(500),
  supplierId: z.string().optional().nullable(),
});

export const comptaExpenseUpdateSchema = comptaExpenseSchema.partial();

export const comptaCashCountSchema = z.object({
  countedAt: z.coerce.date().optional(),
  theoreticalAmount: z.coerce.number().int().min(0),
  denominations: z
    .object({
      bills: z.record(z.string(), z.coerce.number().int().min(0)).optional(),
      coins: z.record(z.string(), z.coerce.number().int().min(0)).optional(),
    })
    .optional()
    .nullable(),
  notes: z.string().max(2000).optional().nullable(),
});
