-- AlterTable
ALTER TABLE "VirtualTour" ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "equipmentUsed" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "scheduledDurationMinutes" INTEGER;

