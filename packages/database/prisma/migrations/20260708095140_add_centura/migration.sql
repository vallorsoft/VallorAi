-- AlterTable
ALTER TABLE "ReinforcementSpec" ADD COLUMN     "centuraId" TEXT;

-- CreateTable
CREATE TABLE "Centura" (
    "id" TEXT NOT NULL,
    "houseId" TEXT NOT NULL,
    "wallId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "heightMm" DOUBLE PRECISION NOT NULL,
    "widthMm" DOUBLE PRECISION NOT NULL,
    "concreteClass" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Centura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Centura_houseId_idx" ON "Centura"("houseId");

-- CreateIndex
CREATE INDEX "Centura_wallId_idx" ON "Centura"("wallId");

-- CreateIndex
CREATE INDEX "ReinforcementSpec_centuraId_idx" ON "ReinforcementSpec"("centuraId");

-- AddForeignKey
ALTER TABLE "Centura" ADD CONSTRAINT "Centura_houseId_fkey" FOREIGN KEY ("houseId") REFERENCES "House"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Centura" ADD CONSTRAINT "Centura_wallId_fkey" FOREIGN KEY ("wallId") REFERENCES "Wall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReinforcementSpec" ADD CONSTRAINT "ReinforcementSpec_centuraId_fkey" FOREIGN KEY ("centuraId") REFERENCES "Centura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Widen the polymorphic-parent CHECK from "exactly one of
-- wallId/foundationId/tieColumnId" to include centuraId now that a
-- ReinforcementSpec can also belong to a Centura.
ALTER TABLE "ReinforcementSpec" DROP CONSTRAINT "ReinforcementSpec_exactly_one_parent";

ALTER TABLE "ReinforcementSpec" ADD CONSTRAINT "ReinforcementSpec_exactly_one_parent"
  CHECK (
    (("wallId" IS NOT NULL)::int + ("foundationId" IS NOT NULL)::int + ("tieColumnId" IS NOT NULL)::int + ("centuraId" IS NOT NULL)::int) = 1
  );
