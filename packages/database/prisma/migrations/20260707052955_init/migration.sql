-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('GUEST', 'USER', 'CLIENT', 'ARCHITECT', 'STRUCTURAL_ENGINEER', 'MEP_ENGINEER', 'ELECTRICAL_ENGINEER', 'CONTRACTOR', 'MANUFACTURER', 'SUPPLIER', 'ADMIN');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'PRO', 'BUSINESS', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('FAMILY_HOUSE', 'VACATION_HOUSE', 'EXTENSION', 'RENOVATION', 'OFFICE', 'INVESTMENT');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'REVIEW', 'APPROVED', 'PERMIT_READY', 'CONSTRUCTION', 'COMPLETED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
    "language" TEXT NOT NULL DEFAULT 'ro',
    "country" TEXT NOT NULL DEFAULT 'RO',
    "avatarUrl" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ProjectType" NOT NULL DEFAULT 'FAMILY_HOUSE',
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'RO',
    "county" TEXT,
    "city" TEXT,
    "address" TEXT,
    "cadastralNumber" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "area" DOUBLE PRECISION,
    "slope" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "orientation" TEXT,
    "zone" TEXT,
    "hasWater" BOOLEAN NOT NULL DEFAULT false,
    "hasSewage" BOOLEAN NOT NULL DEFAULT false,
    "hasGas" BOOLEAN NOT NULL DEFAULT false,
    "hasElectricity" BOOLEAN NOT NULL DEFAULT false,
    "hasInternet" BOOLEAN NOT NULL DEFAULT false,
    "photos" TEXT[],
    "documents" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lifestyle" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "residents" INTEGER NOT NULL DEFAULT 2,
    "children" INTEGER NOT NULL DEFAULT 0,
    "planningChildren" BOOLEAN NOT NULL DEFAULT false,
    "elderlyResident" BOOLEAN NOT NULL DEFAULT false,
    "mobilityImpaired" BOOLEAN NOT NULL DEFAULT false,
    "pets" BOOLEAN NOT NULL DEFAULT false,
    "homeOffice" BOOLEAN NOT NULL DEFAULT false,
    "garage" BOOLEAN NOT NULL DEFAULT false,
    "pool" BOOLEAN NOT NULL DEFAULT false,
    "terrace" BOOLEAN NOT NULL DEFAULT true,
    "basement" BOOLEAN NOT NULL DEFAULT false,
    "attic" BOOLEAN NOT NULL DEFAULT false,
    "solarPanels" BOOLEAN NOT NULL DEFAULT false,
    "heatPump" BOOLEAN NOT NULL DEFAULT false,
    "style" TEXT NOT NULL DEFAULT 'MODERN',
    "favoriteColors" TEXT[],
    "additionalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lifestyle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RON',
    "minimum" DOUBLE PRECISION,
    "optimal" DOUBLE PRECISION,
    "maximum" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "House" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "totalArea" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "floors" INTEGER NOT NULL DEFAULT 1,
    "roofType" TEXT NOT NULL DEFAULT 'GABLED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "House_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "houseId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "floor" INTEGER NOT NULL DEFAULT 0,
    "area" DOUBLE PRECISION NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "posX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "aiJustification" TEXT,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wall" (
    "id" TEXT NOT NULL,
    "houseId" TEXT NOT NULL,
    "startX" DOUBLE PRECISION NOT NULL,
    "startY" DOUBLE PRECISION NOT NULL,
    "endX" DOUBLE PRECISION NOT NULL,
    "endY" DOUBLE PRECISION NOT NULL,
    "floor" INTEGER NOT NULL DEFAULT 0,
    "thickness" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "height" DOUBLE PRECISION NOT NULL DEFAULT 2.7,
    "isLoad" BOOLEAN NOT NULL DEFAULT false,
    "isExterior" BOOLEAN NOT NULL DEFAULT false,
    "material" TEXT,

    CONSTRAINT "Wall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opening" (
    "id" TEXT NOT NULL,
    "houseId" TEXT NOT NULL,
    "wallId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "sillHeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "swingDirection" TEXT,

    CONSTRAINT "Opening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostEstimate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RON',
    "foundation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "walls" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ceiling" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "roof" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openings" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mechanical" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "electrical" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finishes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "insulation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "laborCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "breakdown" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "fileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_token_idx" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Project_userId_idx" ON "Project"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Plot_projectId_key" ON "Plot"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Lifestyle_projectId_key" ON "Lifestyle"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_projectId_key" ON "Budget"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "House_projectId_key" ON "House"("projectId");

-- CreateIndex
CREATE INDEX "Room_houseId_idx" ON "Room"("houseId");

-- CreateIndex
CREATE INDEX "Wall_houseId_idx" ON "Wall"("houseId");

-- CreateIndex
CREATE INDEX "Opening_houseId_idx" ON "Opening"("houseId");

-- CreateIndex
CREATE INDEX "Opening_wallId_idx" ON "Opening"("wallId");

-- CreateIndex
CREATE INDEX "Message_projectId_idx" ON "Message"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "CostEstimate_projectId_key" ON "CostEstimate"("projectId");

-- CreateIndex
CREATE INDEX "Document_projectId_idx" ON "Document"("projectId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plot" ADD CONSTRAINT "Plot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lifestyle" ADD CONSTRAINT "Lifestyle_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "House" ADD CONSTRAINT "House_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_houseId_fkey" FOREIGN KEY ("houseId") REFERENCES "House"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wall" ADD CONSTRAINT "Wall_houseId_fkey" FOREIGN KEY ("houseId") REFERENCES "House"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opening" ADD CONSTRAINT "Opening_houseId_fkey" FOREIGN KEY ("houseId") REFERENCES "House"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opening" ADD CONSTRAINT "Opening_wallId_fkey" FOREIGN KEY ("wallId") REFERENCES "Wall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostEstimate" ADD CONSTRAINT "CostEstimate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
