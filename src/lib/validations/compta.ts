import { z } from "zod";

export const comptaProductSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  price: z.coerce.number().int().min(0),
  vatRate: z.coerce.number().min(0).max(100).default(10),
  costPrice: z.coerce.number().int().min(0).optional().nullable(),
  aliases: z.array(z.string().min(1).max(100)).default([]),
  isActive: z.coerce.boolean().default(true),
  isFavorite: z.coerce.boolean().default(false),
  // Taux TVA nommé sélectionné (Paramètres → TVA) — optionnel : un produit peut toujours saisir
  // `vatRate` directement sans passer par le catalogue de taux (comportement historique inchangé).
  vatRateId: z.string().optional().nullable(),
});

export const comptaProductUpdateSchema = comptaProductSchema.partial();

export const comptaSaleLineSchema = z.object({
  productId: z.string().optional().nullable(),
  productName: z.string().min(1).max(200),
  quantity: z.coerce.number().int().min(1).default(1),
  unitPrice: z.coerce.number().int().min(0),
  vatRate: z.coerce.number().min(0).max(100),
});

export const COMPTA_PAYMENT_METHODS = ["CASH", "CARD", "TRANSFER", "MEAL_VOUCHER", "CHEQUE", "OTHER"] as const;

export const comptaSaleSchema = z.object({
  soldAt: z.coerce.date(),
  paymentMethod: z.enum(COMPTA_PAYMENT_METHODS),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  notes: z.string().max(2000).optional().nullable(),
  customerId: z.string().optional().nullable(),
  lines: z.array(comptaSaleLineSchema).min(1),
});

export const comptaSaleCancelSchema = z.object({
  reason: z.string().max(500).optional().nullable(),
});

// Remboursement intégral uniquement en v2 — un remboursement partiel (sous-ensemble de lignes)
// est une extension future, volontairement pas commencée à moitié ici.
export const comptaSaleRefundSchema = z.object({
  reason: z.string().max(500).optional().nullable(),
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

// --- Stock / recettes (v2) --------------------------------------------------

export const comptaIngredientSchema = z.object({
  name: z.string().min(1).max(200),
  unit: z.string().min(1).max(20),
  stockQuantity: z.coerce.number().min(0).default(0),
  lowStockThreshold: z.coerce.number().min(0).optional().nullable(),
  unitCost: z.coerce.number().int().min(0).optional().nullable(),
});

export const comptaIngredientUpdateSchema = comptaIngredientSchema.omit({ stockQuantity: true }).partial();

export const comptaStockCorrectionSchema = z.object({
  newQuantity: z.coerce.number().min(0),
  reason: z.string().min(1).max(500),
});

export const comptaRecipeLineSchema = z.object({
  ingredientId: z.string(),
  quantity: z.coerce.number().min(0.001),
});

export const comptaRecipeSchema = z.object({
  lines: z.array(comptaRecipeLineSchema),
});

// --- Achats / fournisseurs (v2) ---------------------------------------------

export const comptaPurchaseOrderLineSchema = z.object({
  ingredientId: z.string().optional().nullable(),
  label: z.string().min(1).max(200),
  quantity: z.coerce.number().min(0.001),
  unitCost: z.coerce.number().int().min(0),
});

export const comptaPurchaseOrderSchema = z.object({
  supplierId: z.string(),
  notes: z.string().max(2000).optional().nullable(),
  lines: z.array(comptaPurchaseOrderLineSchema).min(1),
});

export const comptaPurchasePaymentSchema = z.object({
  amount: z.coerce.number().int().min(1),
  paidAt: z.coerce.date().optional(),
  method: z.string().min(1).max(60),
});

// --- Caisse : sessions (v2) --------------------------------------------------

export const comptaCashSessionOpenSchema = z.object({
  openingFloat: z.coerce.number().int().min(0),
  notes: z.string().max(2000).optional().nullable(),
});

export const comptaCashSessionCloseSchema = z.object({
  denominations: z
    .object({
      bills: z.record(z.string(), z.coerce.number().int().min(0)).optional(),
      coins: z.record(z.string(), z.coerce.number().int().min(0)).optional(),
    })
    .optional()
    .nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

// --- Clients / fidélité (v2) -------------------------------------------------

export const comptaCustomerSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(40).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  notes: z.string().max(2000).optional().nullable(),
  loyaltyPoints: z.coerce.number().int().optional(),
});

export const comptaCustomerUpdateSchema = comptaCustomerSchema.partial();

// --- Commandes clients ("Commandes", Service Flow) ---------------------------

export const comptaOrderCreateSchema = z.object({
  name: z.string().max(200).optional().nullable(),
});

export const comptaOrderRenameSchema = z.object({
  name: z.string().max(200).optional().nullable(),
});

export const comptaOrderAddItemSchema = z.object({
  productId: z.string(),
});

// `quantity: 0` est valide et signifie "supprimer la ligne" (voir order-service.ts#updateOrderItem).
export const comptaOrderItemUpdateSchema = z.object({
  quantity: z.coerce.number().int().min(0),
});

export const comptaOrderCheckoutSchema = z.object({
  paymentMethod: z.enum(COMPTA_PAYMENT_METHODS),
  customerId: z.string().optional().nullable(),
});

export const comptaOrderCancelSchema = z.object({
  reason: z.string().max(500).optional().nullable(),
});

// --- TVA configurable (Service Flow) ------------------------------------------

export const comptaVatRateSchema = z.object({
  name: z.string().min(1).max(100),
  rate: z.coerce.number().min(0).max(100),
  isActive: z.coerce.boolean().default(true),
});

export const comptaVatRateUpdateSchema = comptaVatRateSchema.partial();
