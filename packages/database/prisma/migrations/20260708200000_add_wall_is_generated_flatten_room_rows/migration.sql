-- Wall.isGenerated: marks walls derived automatically from the room
-- rectangles (bim-engine wall-generation). Generated walls are deleted and
-- re-derived on every AI room change; user-drawn walls never carry the flag.
ALTER TABLE "Wall" ADD COLUMN "isGenerated" BOOLEAN NOT NULL DEFAULT false;

-- Remove the flat-view placeholder row offset the AI room mapper used to
-- bake into posY (FLOOR_ROW_HEIGHT_M = 15m per floor level) so floors could
-- be told apart on the floor-filterless 2D canvas. The canvas now has a real
-- floor switcher and the 3D viewer stacks floors by elevation, so the offset
-- would misalign upper floors sideways. Every existing floor<>0 room was
-- positioned by the mapper (no UI or seed path creates rooms on other floors
-- manually), so inverting the exact formula restores clean per-floor
-- coordinates.
UPDATE "Room" SET "posY" = "posY" - ("floor" * 15) WHERE "floor" <> 0;
