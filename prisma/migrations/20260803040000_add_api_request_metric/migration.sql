-- CreateTable
CREATE TABLE "ApiRequestMetric" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "route" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiRequestMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApiRequestMetric_organizationId_createdAt_idx" ON "ApiRequestMetric"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ApiRequestMetric_route_idx" ON "ApiRequestMetric"("route");

-- AddForeignKey
ALTER TABLE "ApiRequestMetric" ADD CONSTRAINT "ApiRequestMetric_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

