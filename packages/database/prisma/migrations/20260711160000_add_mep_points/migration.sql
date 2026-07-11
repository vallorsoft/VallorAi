-- Migration: add_mep_points
-- Adds the MepPointType enum and MepPoint table for the MEP (Mechanical,
-- Electrical, Plumbing) base module. Points are derived deterministically per
-- room via packages/bim-engine mep.ts using Romanian standards:
--   I 9-2015 (sanitary installations — water supply / drain counts per room)
--   NTE 007/08/00 + PE 155/92 (electrical — outlet/switch/lighting counts)
-- Auto-provisioned by HousesService.getMepPoints on first access (idempotent).

CREATE TYPE "MepPointType" AS ENUM (
  'WATER_SUPPLY',
  'HOT_WATER_SUPPLY',
  'DRAIN',
  'ELECTRICAL_OUTLET',
  'SWITCH',
  'LIGHTING_POINT'
);

CREATE TABLE "MepPoint" (
  "id"        TEXT         NOT NULL,
  "houseId"   TEXT         NOT NULL,
  "roomId"    TEXT,
  "type"      "MepPointType" NOT NULL,
  "count"     INTEGER      NOT NULL,
  "standard"  TEXT         NOT NULL,
  "notes"     TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MepPoint_pkey" PRIMARY KEY ("id")
);

-- Foreign keys
ALTER TABLE "MepPoint"
  ADD CONSTRAINT "MepPoint_houseId_fkey"
    FOREIGN KEY ("houseId") REFERENCES "House"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MepPoint"
  ADD CONSTRAINT "MepPoint_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "MepPoint_houseId_idx" ON "MepPoint"("houseId");
CREATE INDEX "MepPoint_roomId_idx"  ON "MepPoint"("roomId");
