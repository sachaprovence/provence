import "server-only";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { ValidationError } from "@/lib/errors";

/**
 * Sauvegarde/restauration Compta Vellano.
 *
 * La sauvegarde de PLATEFORME (base Postgres entière, planifiée,
 * vérifiée) existe déjà et couvre Compta Vellano sans travail
 * supplémentaire — voir `scripts/backup-database.ts` / `npm run
 * backup:scheduled` / `docs/adr/0048-...md`. Ce module ajoute un export/
 * import JSON en libre-service PAR ORGANISATION (pas un accès admin
 * plateforme), pour qu'un pizzaiolo puisse télécharger une copie de ses
 * données à tout moment sans dépendre d'un accès à l'infrastructure.
 *
 * L'import est volontairement restreint à la RESTAURATION d'une
 * sauvegarde de la MÊME organisation (jamais un import cross-tenant,
 * jamais une fusion avec les données existantes) : la totalité des
 * données Compta de l'organisation est remplacée dans UNE transaction
 * (tout ou rien) — un import partiel qui échoue en cours de route serait
 * pire qu'un refus net.
 */

const BACKUP_VERSION = 1;

export interface ComptaBackupPayload {
  version: number;
  exportedAt: string;
  organizationId: string;
  data: {
    products: unknown[];
    customers: unknown[];
    ingredients: unknown[];
    suppliers: unknown[];
    recipeLines: unknown[];
    expenses: unknown[];
    cashCounts: unknown[];
    cashSessions: unknown[];
    sales: unknown[];
    saleLines: unknown[];
    purchaseOrders: unknown[];
    purchaseOrderLines: unknown[];
    purchasePayments: unknown[];
  };
}

export async function exportOrganizationData(organizationId: string): Promise<ComptaBackupPayload> {
  const [
    products,
    customers,
    ingredients,
    suppliers,
    recipeLines,
    expenses,
    cashCounts,
    cashSessions,
    sales,
    saleLines,
    purchaseOrders,
    purchaseOrderLines,
    purchasePayments,
  ] = await Promise.all([
    prisma.comptaProduct.findMany({ where: { organizationId } }),
    prisma.comptaCustomer.findMany({ where: { organizationId } }),
    prisma.comptaIngredient.findMany({ where: { organizationId } }),
    prisma.comptaSupplier.findMany({ where: { organizationId } }),
    prisma.comptaRecipeLine.findMany({ where: { organizationId } }),
    prisma.comptaExpense.findMany({ where: { organizationId } }),
    prisma.comptaCashCount.findMany({ where: { organizationId } }),
    prisma.comptaCashSession.findMany({ where: { organizationId } }),
    prisma.comptaSale.findMany({ where: { organizationId } }),
    prisma.comptaSaleLine.findMany({ where: { sale: { organizationId } } }),
    prisma.comptaPurchaseOrder.findMany({ where: { organizationId } }),
    prisma.comptaPurchaseOrderLine.findMany({ where: { purchaseOrder: { organizationId } } }),
    prisma.comptaPurchasePayment.findMany({ where: { organizationId } }),
  ]);

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    organizationId,
    data: {
      products,
      customers,
      ingredients,
      suppliers,
      recipeLines,
      expenses,
      cashCounts,
      cashSessions,
      sales,
      saleLines,
      purchaseOrders,
      purchaseOrderLines,
      purchasePayments,
    },
  };
}

function assertValidPayload(organizationId: string, payload: unknown): asserts payload is ComptaBackupPayload {
  if (!payload || typeof payload !== "object") throw new ValidationError("Fichier de sauvegarde invalide.");
  const candidate = payload as Partial<ComptaBackupPayload>;
  if (candidate.organizationId !== organizationId) {
    throw new ValidationError("Cette sauvegarde appartient à une autre organisation — import refusé.");
  }
  if (!candidate.data || typeof candidate.data !== "object") {
    throw new ValidationError("Fichier de sauvegarde invalide (données manquantes).");
  }
  const requiredKeys: (keyof ComptaBackupPayload["data"])[] = [
    "products", "customers", "ingredients", "suppliers", "recipeLines", "expenses",
    "cashCounts", "cashSessions", "sales", "saleLines", "purchaseOrders", "purchaseOrderLines", "purchasePayments",
  ];
  for (const key of requiredKeys) {
    if (!Array.isArray(candidate.data[key])) {
      throw new ValidationError(`Fichier de sauvegarde invalide (section "${key}" manquante ou incorrecte).`);
    }
  }
}

export async function importOrganizationData(organizationId: string, payload: unknown, actorUserId: string): Promise<void> {
  assertValidPayload(organizationId, payload);
  const { data } = payload;

  await prisma.$transaction(async (tx) => {
    // Ordre de suppression : enfants avant parents.
    await tx.comptaSaleLine.deleteMany({ where: { sale: { organizationId } } });
    await tx.comptaSale.deleteMany({ where: { organizationId } });
    await tx.comptaPurchaseOrderLine.deleteMany({ where: { purchaseOrder: { organizationId } } });
    await tx.comptaPurchasePayment.deleteMany({ where: { organizationId } });
    await tx.comptaPurchaseOrder.deleteMany({ where: { organizationId } });
    await tx.comptaStockMovement.deleteMany({ where: { organizationId } });
    await tx.comptaRecipeLine.deleteMany({ where: { organizationId } });
    await tx.comptaCashCount.deleteMany({ where: { organizationId } });
    await tx.comptaCashSession.deleteMany({ where: { organizationId } });
    await tx.comptaExpense.deleteMany({ where: { organizationId } });
    await tx.comptaSupplier.deleteMany({ where: { organizationId } });
    await tx.comptaIngredient.deleteMany({ where: { organizationId } });
    await tx.comptaCustomer.deleteMany({ where: { organizationId } });
    await tx.comptaProduct.deleteMany({ where: { organizationId } });

    // Ordre de recréation : parents avant enfants (mêmes id d'origine, préservés depuis l'export).
    // @ts-expect-error -- payload JSON non typé finement (voir `assertValidPayload`), les colonnes réelles sont validées par les contraintes SQL à l'insertion.
    if (data.products.length) await tx.comptaProduct.createMany({ data: data.products });
    // @ts-expect-error -- idem
    if (data.customers.length) await tx.comptaCustomer.createMany({ data: data.customers });
    // @ts-expect-error -- idem
    if (data.ingredients.length) await tx.comptaIngredient.createMany({ data: data.ingredients });
    // @ts-expect-error -- idem
    if (data.suppliers.length) await tx.comptaSupplier.createMany({ data: data.suppliers });
    // @ts-expect-error -- idem
    if (data.recipeLines.length) await tx.comptaRecipeLine.createMany({ data: data.recipeLines });
    // @ts-expect-error -- idem
    if (data.expenses.length) await tx.comptaExpense.createMany({ data: data.expenses });
    // @ts-expect-error -- idem
    if (data.cashCounts.length) await tx.comptaCashCount.createMany({ data: data.cashCounts });
    // @ts-expect-error -- idem
    if (data.cashSessions.length) await tx.comptaCashSession.createMany({ data: data.cashSessions });
    // @ts-expect-error -- idem
    if (data.sales.length) await tx.comptaSale.createMany({ data: data.sales });
    // @ts-expect-error -- idem
    if (data.saleLines.length) await tx.comptaSaleLine.createMany({ data: data.saleLines });
    // @ts-expect-error -- idem
    if (data.purchaseOrders.length) await tx.comptaPurchaseOrder.createMany({ data: data.purchaseOrders });
    // @ts-expect-error -- idem
    if (data.purchaseOrderLines.length) await tx.comptaPurchaseOrderLine.createMany({ data: data.purchaseOrderLines });
    // @ts-expect-error -- idem
    if (data.purchasePayments.length) await tx.comptaPurchasePayment.createMany({ data: data.purchasePayments });
  });

  await writeAuditLog({
    organizationId,
    userId: actorUserId,
    action: "compta_backup.restored",
    entityType: "Organization",
    entityId: organizationId,
    metadata: { salesCount: data.sales.length, expensesCount: data.expenses.length },
  });
}

export async function listComptaActivityLog(organizationId: string, limit = 100) {
  return prisma.auditLog.findMany({
    where: { organizationId, action: { startsWith: "compta_" } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
  });
}
