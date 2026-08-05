-- CreateEnum
CREATE TYPE "ComptaPaymentMethod" AS ENUM ('CASH', 'CARD', 'TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "ComptaExpenseCategory" AS ENUM ('INGREDIENTS', 'RENT', 'UTILITIES', 'SALARIES', 'EQUIPMENT', 'MARKETING', 'TAXES', 'OTHER');

-- CreateTable
CREATE TABLE "ComptaProduct" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "costPrice" INTEGER,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComptaProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComptaSale" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "soldAt" TIMESTAMP(3) NOT NULL,
    "paymentMethod" "ComptaPaymentMethod" NOT NULL,
    "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subtotalAmount" INTEGER NOT NULL DEFAULT 0,
    "vatAmount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComptaSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComptaSaleLine" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL,
    "vatRate" DOUBLE PRECISION NOT NULL,
    "lineTotal" INTEGER NOT NULL,

    CONSTRAINT "ComptaSaleLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComptaSupplier" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "balanceDue" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComptaSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComptaExpense" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "spentAt" TIMESTAMP(3) NOT NULL,
    "amount" INTEGER NOT NULL,
    "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "vatAmount" INTEGER NOT NULL DEFAULT 0,
    "category" "ComptaExpenseCategory" NOT NULL DEFAULT 'OTHER',
    "description" TEXT NOT NULL,
    "supplierId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComptaExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComptaCashCount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "countedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "theoreticalAmount" INTEGER NOT NULL,
    "countedAmount" INTEGER NOT NULL,
    "differenceAmount" INTEGER NOT NULL,
    "denominations" JSONB,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComptaCashCount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComptaProduct_organizationId_idx" ON "ComptaProduct"("organizationId");

-- CreateIndex
CREATE INDEX "ComptaSale_organizationId_soldAt_idx" ON "ComptaSale"("organizationId", "soldAt");

-- CreateIndex
CREATE INDEX "ComptaSale_workspaceId_idx" ON "ComptaSale"("workspaceId");

-- CreateIndex
CREATE INDEX "ComptaSaleLine_saleId_idx" ON "ComptaSaleLine"("saleId");

-- CreateIndex
CREATE INDEX "ComptaSaleLine_productId_idx" ON "ComptaSaleLine"("productId");

-- CreateIndex
CREATE INDEX "ComptaSupplier_organizationId_idx" ON "ComptaSupplier"("organizationId");

-- CreateIndex
CREATE INDEX "ComptaSupplier_workspaceId_idx" ON "ComptaSupplier"("workspaceId");

-- CreateIndex
CREATE INDEX "ComptaExpense_organizationId_spentAt_idx" ON "ComptaExpense"("organizationId", "spentAt");

-- CreateIndex
CREATE INDEX "ComptaExpense_workspaceId_idx" ON "ComptaExpense"("workspaceId");

-- CreateIndex
CREATE INDEX "ComptaExpense_supplierId_idx" ON "ComptaExpense"("supplierId");

-- CreateIndex
CREATE INDEX "ComptaCashCount_organizationId_countedAt_idx" ON "ComptaCashCount"("organizationId", "countedAt");

-- CreateIndex
CREATE INDEX "ComptaCashCount_workspaceId_idx" ON "ComptaCashCount"("workspaceId");

-- AddForeignKey
ALTER TABLE "ComptaProduct" ADD CONSTRAINT "ComptaProduct_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaSale" ADD CONSTRAINT "ComptaSale_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaSale" ADD CONSTRAINT "ComptaSale_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaSale" ADD CONSTRAINT "ComptaSale_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaSaleLine" ADD CONSTRAINT "ComptaSaleLine_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "ComptaSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaSaleLine" ADD CONSTRAINT "ComptaSaleLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ComptaProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaSupplier" ADD CONSTRAINT "ComptaSupplier_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaSupplier" ADD CONSTRAINT "ComptaSupplier_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaExpense" ADD CONSTRAINT "ComptaExpense_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaExpense" ADD CONSTRAINT "ComptaExpense_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaExpense" ADD CONSTRAINT "ComptaExpense_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "ComptaSupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaExpense" ADD CONSTRAINT "ComptaExpense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaCashCount" ADD CONSTRAINT "ComptaCashCount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaCashCount" ADD CONSTRAINT "ComptaCashCount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaCashCount" ADD CONSTRAINT "ComptaCashCount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
