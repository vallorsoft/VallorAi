-- CreateEnum
CREATE TYPE "TieColumnCategory" AS ENUM ('S1', 'S2');

-- AlterEnum
ALTER TYPE "MaterialCategory" ADD VALUE 'PRECAST';

-- AlterTable
ALTER TABLE "ReinforcementSpec" ADD COLUMN     "tieColumnId" TEXT,
ADD COLUMN     "barCount" INTEGER;

-- CreateTable
CREATE TABLE "TieColumn" (
    "id" TEXT NOT NULL,
    "houseId" TEXT NOT NULL,
    "floor" INTEGER NOT NULL DEFAULT 0,
    "posX" DOUBLE PRECISION NOT NULL,
    "posY" DOUBLE PRECISION NOT NULL,
    "category" "TieColumnCategory" NOT NULL,
    "crossSectionMm" DOUBLE PRECISION NOT NULL,
    "concreteClass" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TieColumn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lintel" (
    "id" TEXT NOT NULL,
    "openingId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "lengthMm" DOUBLE PRECISION NOT NULL,
    "widthMm" DOUBLE PRECISION NOT NULL,
    "bearingLengthMm" DOUBLE PRECISION NOT NULL,
    "prefabricated" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lintel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TieColumn_houseId_idx" ON "TieColumn"("houseId");

-- CreateIndex
CREATE UNIQUE INDEX "Lintel_openingId_key" ON "Lintel"("openingId");

-- CreateIndex
CREATE INDEX "Lintel_materialId_idx" ON "Lintel"("materialId");

-- CreateIndex
CREATE INDEX "ReinforcementSpec_tieColumnId_idx" ON "ReinforcementSpec"("tieColumnId");

-- AddForeignKey
ALTER TABLE "TieColumn" ADD CONSTRAINT "TieColumn_houseId_fkey" FOREIGN KEY ("houseId") REFERENCES "House"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lintel" ADD CONSTRAINT "Lintel_openingId_fkey" FOREIGN KEY ("openingId") REFERENCES "Opening"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lintel" ADD CONSTRAINT "Lintel_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReinforcementSpec" ADD CONSTRAINT "ReinforcementSpec_tieColumnId_fkey" FOREIGN KEY ("tieColumnId") REFERENCES "TieColumn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Widen the polymorphic-parent CHECK from "exactly one of wallId/foundationId"
-- to "exactly one of wallId/foundationId/tieColumnId" now that a
-- ReinforcementSpec can also belong to a TieColumn.
ALTER TABLE "ReinforcementSpec" DROP CONSTRAINT "ReinforcementSpec_exactly_one_parent";

ALTER TABLE "ReinforcementSpec" ADD CONSTRAINT "ReinforcementSpec_exactly_one_parent"
  CHECK (
    (("wallId" IS NOT NULL)::int + ("foundationId" IS NOT NULL)::int + ("tieColumnId" IS NOT NULL)::int) = 1
  );
