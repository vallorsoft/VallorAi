/**
 * Maps the AI's loosely-typed `design_update` payload (see
 * schemas/design-response.schema.ts — `data` is intentionally
 * `z.record(z.unknown())` because the system prompt only sketches the shape)
 * into concrete HousesService.addRoom/updateRoom input. This is what makes
 * an ADD_ROOM/UPDATE_ROOM turn in the AI chat actually appear in the 2D/3D
 * editor, instead of being parsed into Message.metadata and never used.
 */

// Romanian floor-naming conventions the AI has been observed to use
// ("parter"/"etaj"), plus their Hungarian equivalents (the AI replies in
// whatever language the conversation is in). "exterior" (a detached
// structure like a boiler room) is placed on the ground floor alongside the
// rest of the plan — this app has no separate site-plan/outbuilding concept
// yet, so floor 0 is the closest honest fit.
const FLOOR_LEVELS: Record<string, number> = {
  parter: 0,
  foldszint: 0,
  demisol: -1,
  subsol: -1,
  pince: -1,
  etaj: 1,
  emelet: 1,
  mansarda: 2,
  padlas: 2,
  pod: 2,
  exterior: 0,
  kulso: 0,
}

// Matches Wall.height's default (schema.prisma) — no per-room ceiling height
// is ever supplied by the AI, so this is a plain residential-default
// placeholder, not a value read off any standard.
export const DEFAULT_ROOM_HEIGHT_M = 2.7

// No floor-plan solver exists (see CLAUDE.md BIM-detail roadmap) — this is a
// deliberately simple placeholder aspect ratio so a room described only by
// its area (`suggested_area_sqm`) gets *a* rectangle instead of no geometry
// at all. It is not meant to represent a real floor-plan layout.
const ROOM_ASPECT_RATIO = 1.3
const ROOM_GAP_M = 0.3

// The 2D floor-plan canvas (FloorPlanCanvas.tsx) has no floor filter yet —
// it draws every room from every floor on the same flat view. Without this,
// two floors' room rows would both start at (0,0) and visually overlap.
// Stacking each floor's row well below the previous one keeps them readable
// as separate rows until the canvas grows real floor switching; it is not a
// real multi-story layout.
const FLOOR_ROW_HEIGHT_M = 15

function resolveFloor(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.round(raw)
  if (typeof raw !== 'string') return null
  const key = raw.trim().toLowerCase()
  if (key in FLOOR_LEVELS) return FLOOR_LEVELS[key]
  const asNumber = Number(key)
  return Number.isFinite(asNumber) ? Math.round(asNumber) : null
}

function humanizeRoomType(roomType: string): string {
  return roomType
    .replace(/_/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export interface MappedRoom {
  type: string
  name: string
  floor: number
  area: number
  width: number
  height: number
  aiJustification?: string
}

/**
 * Maps one design_update.data payload to room fields, or returns null when
 * the payload doesn't describe an actual room — e.g. the AI's whole-house
 * "global" style/summary update (no room_type), or a payload missing the two
 * facts that matter: what the room is and how big it is.
 */
export function roomFromDesignUpdateData(data: Record<string, unknown>): MappedRoom | null {
  const floor = resolveFloor(data.floor)
  const area = typeof data.suggested_area_sqm === 'number' ? data.suggested_area_sqm : null
  const roomType = typeof data.room_type === 'string' && data.room_type.trim() ? data.room_type : null
  if (floor === null || area === null || area <= 0 || !roomType) return null

  const width = Math.round(Math.sqrt(area * ROOM_ASPECT_RATIO) * 100) / 100
  const description = typeof data.description === 'string' ? data.description.trim() : ''

  return {
    type: roomType,
    name: humanizeRoomType(roomType),
    floor,
    area,
    width,
    height: DEFAULT_ROOM_HEIGHT_M,
    aiJustification: description || undefined,
  }
}

/**
 * Lays a new room out next to the existing rooms on the same floor, left to
 * right with a small gap — a simple non-overlapping placeholder placement,
 * not a solved floor plan (see ROOM_ASPECT_RATIO note above). Rooms on other
 * floors don't affect this floor's row, but each floor's row is offset in Y
 * (see FLOOR_ROW_HEIGHT_M) so floors don't overlap in the flat 2D view.
 */
export function nextRoomPosition(
  existingRoomsOnFloor: Array<{ posX: number; width: number }>,
  floor: number,
): { posX: number; posY: number } {
  const posY = floor * FLOOR_ROW_HEIGHT_M
  if (existingRoomsOnFloor.length === 0) return { posX: 0, posY }
  const rightmost = existingRoomsOnFloor.reduce((max, r) => Math.max(max, r.posX + r.width), 0)
  return { posX: Math.round((rightmost + ROOM_GAP_M) * 100) / 100, posY }
}
