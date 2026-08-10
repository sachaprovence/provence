-- CreateEnum
CREATE TYPE "ComptaSaleStatus" AS ENUM ('COMPLETED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ComptaStockMovementType" AS ENUM ('SALE_DEDUCTION', 'PURCHASE_RECEPTION', 'CORRECTION', 'INITIAL');

-- CreateEnum
CREATE TYPE "ComptaPurchaseOrderStatus" AS ENUM ('DRAFT', 'ORDERED', 'RECEIVED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ComptaPaymentMethod" ADD VALUE 'MEAL_VOUCHER';
ALTER TYPE "ComptaPaymentMethod" ADD VALUE 'CHEQUE';

-- AlterTable
ALTER TABLE "ComptaProduct" ADD COLUMN     "isFavorite" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ComptaSale" ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "refundOfSaleId" TEXT,
ADD COLUMN     "status" "ComptaSaleStatus" NOT NULL DEFAULT 'COMPLETED';

-- CreateTable
CREATE TABLE "ComptaIngredient" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "stockQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lowStockThreshold" DOUBLE PRECISION,
    "unitCost" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComptaIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComptaRecipeLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ComptaRecipeLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComptaStockMovement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "type" "ComptaStockMovementType" NOT NULL,
    "quantityDelta" DOUBLE PRECISION NOT NULL,
    "resultingQuantity" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "relatedSaleId" TEXT,
    "relatedPurchaseOrderId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComptaStockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComptaPurchaseOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" "ComptaPurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "orderedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComptaPurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComptaPurchaseOrderLine" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "ingredientId" TEXT,
    "label" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" INTEGER NOT NULL,
    "lineTotal" INTEGER NOT NULL,

    CONSTRAINT "ComptaPurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComptaPurchasePayment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComptaPurchasePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComptaCashSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedById" TEXT,
    "openingFloat" INTEGER NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "closingCountedAmount" INTEGER,
    "theoreticalAmount" INTEGER,
    "differenceAmount" INTEGER,
    "denominations" JSONB,
    "notes" TEXT,

    CONSTRAINT "ComptaCashSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComptaCustomer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "loyaltyPoints" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComptaCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComptaIngredient_organizationId_idx" ON "ComptaIngredient"("organizationId");

-- CreateIndex
CREATE INDEX "ComptaIngredient_organizationId_name_idx" ON "ComptaIngredient"("organizationId", "name");

-- CreateIndex
CREATE INDEX "ComptaRecipeLine_organizationId_idx" ON "ComptaRecipeLine"("organizationId");

-- CreateIndex
CREATE INDEX "ComptaRecipeLine_productId_idx" ON "ComptaRecipeLine"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ComptaRecipeLine_productId_ingredientId_key" ON "ComptaRecipeLine"("productId", "ingredientId");

-- CreateIndex
CREATE INDEX "ComptaStockMovement_organizationId_createdAt_idx" ON "ComptaStockMovement"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ComptaStockMovement_ingredientId_createdAt_idx" ON "ComptaStockMovement"("ingredientId", "createdAt");

-- CreateIndex
CREATE INDEX "ComptaPurchaseOrder_organizationId_createdAt_idx" ON "ComptaPurchaseOrder"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ComptaPurchaseOrder_supplierId_idx" ON "ComptaPurchaseOrder"("supplierId");

-- CreateIndex
CREATE INDEX "ComptaPurchaseOrderLine_purchaseOrderId_idx" ON "ComptaPurchaseOrderLine"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "ComptaPurchaseOrderLine_ingredientId_idx" ON "ComptaPurchaseOrderLine"("ingredientId");

-- CreateIndex
CREATE INDEX "ComptaPurchasePayment_organizationId_idx" ON "ComptaPurchasePayment"("organizationId");

-- CreateIndex
CREATE INDEX "ComptaPurchasePayment_purchaseOrderId_idx" ON "ComptaPurchasePayment"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "ComptaCashSession_organizationId_openedAt_idx" ON "ComptaCashSession"("organizationId", "openedAt");

-- CreateIndex
CREATE INDEX "ComptaCashSession_workspaceId_idx" ON "ComptaCashSession"("workspaceId");

-- CreateIndex
CREATE INDEX "ComptaCustomer_organizationId_idx" ON "ComptaCustomer"("organizationId");

-- CreateIndex
CREATE INDEX "ComptaCustomer_organizationId_name_idx" ON "ComptaCustomer"("organizationId", "name");

-- CreateIndex
CREATE INDEX "ComptaProduct_organizationId_isFavorite_idx" ON "ComptaProduct"("organizationId", "isFavorite");

-- CreateIndex
CREATE INDEX "ComptaSale_customerId_idx" ON "ComptaSale"("customerId");

-- CreateIndex
CREATE INDEX "ComptaSale_refundOfSaleId_idx" ON "ComptaSale"("refundOfSaleId");

-- CreateIndex
CREATE UNIQUE INDEX "ComptaSale_organizationId_reference_key" ON "ComptaSale"("organizationId", "reference");

-- AddForeignKey
ALTER TABLE "ComptaSale" ADD CONSTRAINT "ComptaSale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "ComptaCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaSale" ADD CONSTRAINT "ComptaSale_refundOfSaleId_fkey" FOREIGN KEY ("refundOfSaleId") REFERENCES "ComptaSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaIngredient" ADD CONSTRAINT "ComptaIngredient_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaRecipeLine" ADD CONSTRAINT "ComptaRecipeLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaRecipeLine" ADD CONSTRAINT "ComptaRecipeLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ComptaProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaRecipeLine" ADD CONSTRAINT "ComptaRecipeLine_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ComptaIngredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaStockMovement" ADD CONSTRAINT "ComptaStockMovement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaStockMovement" ADD CONSTRAINT "ComptaStockMovement_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ComptaIngredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaStockMovement" ADD CONSTRAINT "ComptaStockMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaPurchaseOrder" ADD CONSTRAINT "ComptaPurchaseOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaPurchaseOrder" ADD CONSTRAINT "ComptaPurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "ComptaSupplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaPurchaseOrder" ADD CONSTRAINT "ComptaPurchaseOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaPurchaseOrderLine" ADD CONSTRAINT "ComptaPurchaseOrderLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "ComptaPurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaPurchaseOrderLine" ADD CONSTRAINT "ComptaPurchaseOrderLine_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ComptaIngredient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaPurchasePayment" ADD CONSTRAINT "ComptaPurchasePayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaPurchasePayment" ADD CONSTRAINT "ComptaPurchasePayment_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "ComptaPurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaPurchasePayment" ADD CONSTRAINT "ComptaPurchasePayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaCashSession" ADD CONSTRAINT "ComptaCashSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaCashSession" ADD CONSTRAINT "ComptaCashSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaCashSession" ADD CONSTRAINT "ComptaCashSession_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaCashSession" ADD CONSTRAINT "ComptaCashSession_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaCustomer" ADD CONSTRAINT "ComptaCustomer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

