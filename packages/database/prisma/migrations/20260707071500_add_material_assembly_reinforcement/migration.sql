-- CreateEnum
CREATE TYPE "MaterialCategory" AS ENUM ('BRICK', 'BLOCK', 'CONCRETE', 'REBAR', 'MORTAR', 'INSULATION', 'RENDER', 'PLASTER', 'PAINT');

-- CreateEnum
CREATE TYPE "MaterialUnit" AS ENUM ('M2', 'M3', 'BUC', 'KG', 'ML');

-- CreateEnum
CREATE TYPE "MaterialSource" AS ENUM ('GENERIC_DEFAULT', 'MANUFACTURER');

-- CreateEnum
CREATE TYPE "LayerFunction" AS ENUM ('STRUCTURAL', 'INSULATION', 'RENDER', 'FINISH', 'PAINT');

-- CreateEnum
CREATE TYPE "RebarRole" AS ENUM ('LONGITUDINAL', 'STIRRUP');

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "category" "MaterialCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "standardRef" TEXT,
    "unit" "MaterialUnit" NOT NULL,
    "unitCostRON" DOUBLE PRECISION NOT NULL,
    "specSheet" JSONB NOT NULL,
    "source" "MaterialSource" NOT NULL DEFAULT 'GENERIC_DEFAULT',
    "supplierId" TEXT,
    "priceUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Foundation" (
    "id" TEXT NOT NULL,
    "houseId" TEXT NOT NULL,
    "depthMm" DOUBLE PRECISION NOT NULL,
    "widthMm" DOUBLE PRECISION NOT NULL,
    "concreteClass" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Foundation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssemblyLayer" (
    "id" TEXT NOT NULL,
    "wallId" TEXT,
    "foundationId" TEXT,
    "order" INTEGER NOT NULL,
    "materialId" TEXT NOT NULL,
    "thicknessMm" DOUBLE PRECISION NOT NULL,
    "function" "LayerFunction" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssemblyLayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReinforcementSpec" (
    "id" TEXT NOT NULL,
    "wallId" TEXT,
    "foundationId" TEXT,
    "role" "RebarRole" NOT NULL,
    "barDiameterMm" DOUBLE PRECISION NOT NULL,
    "spacingMm" DOUBLE PRECISION NOT NULL,
    "coverMm" DOUBLE PRECISION NOT NULL,
    "concreteClass" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReinforcementSpec_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Material_category_idx" ON "Material"("category");

-- CreateIndex
CREATE INDEX "Material_supplierId_idx" ON "Material"("supplierId");

-- CreateIndex
CREATE INDEX "Foundation_houseId_idx" ON "Foundation"("houseId");

-- CreateIndex
CREATE INDEX "AssemblyLayer_wallId_idx" ON "AssemblyLayer"("wallId");

-- CreateIndex
CREATE INDEX "AssemblyLayer_foundationId_idx" ON "AssemblyLayer"("foundationId");

-- CreateIndex
CREATE INDEX "AssemblyLayer_materialId_idx" ON "AssemblyLayer"("materialId");

-- CreateIndex
CREATE INDEX "ReinforcementSpec_wallId_idx" ON "ReinforcementSpec"("wallId");

-- CreateIndex
CREATE INDEX "ReinforcementSpec_foundationId_idx" ON "ReinforcementSpec"("foundationId");

-- AddForeignKey
ALTER TABLE "Foundation" ADD CONSTRAINT "Foundation_houseId_fkey" FOREIGN KEY ("houseId") REFERENCES "House"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyLayer" ADD CONSTRAINT "AssemblyLayer_wallId_fkey" FOREIGN KEY ("wallId") REFERENCES "Wall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyLayer" ADD CONSTRAINT "AssemblyLayer_foundationId_fkey" FOREIGN KEY ("foundationId") REFERENCES "Foundation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyLayer" ADD CONSTRAINT "AssemblyLayer_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReinforcementSpec" ADD CONSTRAINT "ReinforcementSpec_wallId_fkey" FOREIGN KEY ("wallId") REFERENCES "Wall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReinforcementSpec" ADD CONSTRAINT "ReinforcementSpec_foundationId_fkey" FOREIGN KEY ("foundationId") REFERENCES "Foundation"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Enforce "exactly one parent" for polymorphic layer/reinforcement rows
ALTER TABLE "AssemblyLayer" ADD CONSTRAINT "AssemblyLayer_exactly_one_parent"
  CHECK (
    ("wallId" IS NOT NULL AND "foundationId" IS NULL) OR
    ("wallId" IS NULL AND "foundationId" IS NOT NULL)
  );

ALTER TABLE "ReinforcementSpec" ADD CONSTRAINT "ReinforcementSpec_exactly_one_parent"
  CHECK (
    ("wallId" IS NOT NULL AND "foundationId" IS NULL) OR
    ("wallId" IS NULL AND "foundationId" IS NOT NULL)
  );
