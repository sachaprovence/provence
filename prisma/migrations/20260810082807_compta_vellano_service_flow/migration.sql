-- CreateEnum
CREATE TYPE "ComptaOrderStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "ComptaProduct" ADD COLUMN     "vatRateId" TEXT;

-- CreateTable
CREATE TABLE "ComptaOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "number" INTEGER NOT NULL,
    "name" TEXT,
    "status" "ComptaOrderStatus" NOT NULL DEFAULT 'OPEN',
    "paymentMethod" "ComptaPaymentMethod",
    "saleId" TEXT,
    "customerId" TEXT,
    "subtotalAmount" INTEGER,
    "vatAmount" INTEGER,
    "totalAmount" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "ComptaOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComptaOrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "productNameSnapshot" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceTtcSnapshot" INTEGER NOT NULL,
    "vatRateSnapshot" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComptaOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComptaVatRate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComptaVatRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserNavigationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sectionKey" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserNavigationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ComptaOrder_saleId_key" ON "ComptaOrder"("saleId");

-- CreateIndex
CREATE INDEX "ComptaOrder_organizationId_status_idx" ON "ComptaOrder"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ComptaOrder_workspaceId_idx" ON "ComptaOrder"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ComptaOrder_organizationId_number_key" ON "ComptaOrder"("organizationId", "number");

-- CreateIndex
CREATE INDEX "ComptaOrderLine_orderId_idx" ON "ComptaOrderLine"("orderId");

-- CreateIndex
CREATE INDEX "ComptaOrderLine_productId_idx" ON "ComptaOrderLine"("productId");

-- CreateIndex
CREATE INDEX "ComptaVatRate_organizationId_isActive_idx" ON "ComptaVatRate"("organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ComptaVatRate_organizationId_name_key" ON "ComptaVatRate"("organizationId", "name");

-- CreateIndex
CREATE INDEX "UserNavigationPreference_organizationId_idx" ON "UserNavigationPreference"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "UserNavigationPreference_userId_organizationId_sectionKey_key" ON "UserNavigationPreference"("userId", "organizationId", "sectionKey");

-- CreateIndex
CREATE INDEX "ComptaProduct_vatRateId_idx" ON "ComptaProduct"("vatRateId");

-- AddForeignKey
ALTER TABLE "ComptaProduct" ADD CONSTRAINT "ComptaProduct_vatRateId_fkey" FOREIGN KEY ("vatRateId") REFERENCES "ComptaVatRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaOrder" ADD CONSTRAINT "ComptaOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaOrder" ADD CONSTRAINT "ComptaOrder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaOrder" ADD CONSTRAINT "ComptaOrder_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "ComptaSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaOrder" ADD CONSTRAINT "ComptaOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "ComptaCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaOrder" ADD CONSTRAINT "ComptaOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaOrderLine" ADD CONSTRAINT "ComptaOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ComptaOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaOrderLine" ADD CONSTRAINT "ComptaOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ComptaProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComptaVatRate" ADD CONSTRAINT "ComptaVatRate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNavigationPreference" ADD CONSTRAINT "UserNavigationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNavigationPreference" ADD CONSTRAINT "UserNavigationPreference_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
