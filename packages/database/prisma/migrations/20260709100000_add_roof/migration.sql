-- CreateEnum
CREATE TYPE "RoofType" AS ENUM ('GABLED', 'HIPPED', 'FLAT', 'MONOSLOPE');

-- AlterEnum
ALTER TYPE "MaterialCategory" ADD VALUE 'ROOFING';

-- CreateTable
CREATE TABLE "Roof" (
    "id" TEXT NOT NULL,
    "houseId" TEXT NOT NULL,
    "type" "RoofType" NOT NULL,
    "pitchDeg" DOUBLE PRECISION NOT NULL,
    "overhangM" DOUBLE PRECISION NOT NULL,
    "ridgeHeightM" DOUBLE PRECISION NOT NULL,
    "pitchVerified" BOOLEAN NOT NULL DEFAULT true,
    "overhangVerified" BOOLEAN NOT NULL DEFAULT false,
    "materialId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Roof_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Roof_houseId_key" ON "Roof"("houseId");

-- CreateIndex
CREATE INDEX "Roof_materialId_idx" ON "Roof"("materialId");

-- AddForeignKey
ALTER TABLE "Roof" ADD CONSTRAINT "Roof_houseId_fkey" FOREIGN KEY ("houseId") REFERENCES "House"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Roof" ADD CONSTRAINT "Roof_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
