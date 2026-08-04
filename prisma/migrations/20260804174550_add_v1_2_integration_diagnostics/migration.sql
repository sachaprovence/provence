-- CreateEnum
CREATE TYPE "IntegrationDiagnosticKey" AS ENUM ('STRIPE', 'TWILIO', 'GMAIL', 'OUTLOOK', 'S3_STORAGE');

-- CreateEnum
CREATE TYPE "IntegrationDiagnosticStatus" AS ENUM ('NOT_CONFIGURED', 'PARTIALLY_CONFIGURED', 'CONFIGURED', 'TEST_SUCCESS', 'TEST_FAILED', 'UNAVAILABLE');

-- CreateTable
CREATE TABLE "IntegrationDiagnosticCheck" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "integration" "IntegrationDiagnosticKey" NOT NULL,
    "status" "IntegrationDiagnosticStatus" NOT NULL,
    "message" TEXT,
    "checkedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationDiagnosticCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationDiagnosticCheck_organizationId_integration_creat_idx" ON "IntegrationDiagnosticCheck"("organizationId", "integration", "createdAt");

-- AddForeignKey
ALTER TABLE "IntegrationDiagnosticCheck" ADD CONSTRAINT "IntegrationDiagnosticCheck_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationDiagnosticCheck" ADD CONSTRAINT "IntegrationDiagnosticCheck_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
