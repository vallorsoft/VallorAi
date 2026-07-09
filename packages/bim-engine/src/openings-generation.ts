/**
 * Auto-generated door and window placement.
 *
 * With the floor-plan solver in place, an AI-designed house has coherent
 * rectangles for rooms and matching walls generated around them — but until
 * this module ran, none of those walls had any openings. In 3D it read as a
 * sealed brick block: no doors between rooms, no windows on any facade, no
 * entry. This module derives a plausible-enough opening set from the same
 * solved rooms + wall segments the rest of the pipeline uses, so the AI
 * chat's house shows up looking like a house.
 *
 * The three kinds of openings placed:
 *
 * 1. **Interior doors** — one per pair of rooms sharing an interior wall.
 *    Width per **RulesService.minDoorWidth** (Romanian livability rules,
 *    matching C 253/8-1994 practice): 0.8 m internal, 0.7 m into a bathroom
 *    (`isBathroom` picks the smaller opening). Height 2.1 m, sillHeight 0.
 *    Position centered on the shared wall segment, but with a
 *    `DOOR_JAMB_CLEAR_M` clearance from either end so the door doesn't
 *    collide with a corner tie-column (S1 columns sit at intersections —
 *    see confined-masonry.ts) or with the wall's own end.
 *
 * 2. **Exterior windows** — sized to satisfy **Ordinul MS 119/2014**'s
 *    natural-light requirement, using the commonly-cited 1/8 window-to-floor
 *    ratio (the 1/6…1/10 optimum range widely quoted for RO residential
 *    design — see the CLAUDE.md research note). Window area needed per room
 *    is split across whatever exterior wall segments that room borders. Sizes
 *    are rounded to a common residential module (1.2×1.2 m, 1.5×1.2 m). Sill
 *    height defaults to 0.9 m (common residential parapet) except for
 *    bathrooms/kitchens where a higher sill (1.4 m) is used.
 *
 * 3. **Entry door** — one exterior door, placed on the exterior facade of
 *    the entry room (a room in the PUBLIC zone: HALL/ENTRY if present,
 *    else LIVING_ROOM, else the largest public-zone room). Width 0.9 m per
 *    RulesService.minDoorWidth.entrance, height 2.1 m, sillHeight 0.
 *    Preferring the +Y facade — the "public" (south) side per NP 057-2002
 *    orientation — with a fallback to any exterior side of the entry room.
 *
 * Openings are placed only on **generated** walls (isGenerated=true) — user-
 * drawn walls are user-owned. Openings that would fall on a wall shorter
 * than the minimum door + jamb clearance are skipped (a real facade gap
 * shorter than the smallest door is legitimately closed).
 */

import type { GeneratedWallSegment } from './wall-generation'

/** Interior door — RulesService.minDoorWidth.internal, C 253/8-1994 practice. */
export const INTERIOR_DOOR_WIDTH_M = 0.8
/** Bathroom-entry door — RulesService.minDoorWidth.bathroom. */
export const BATHROOM_DOOR_WIDTH_M = 0.7
/** Entrance door — RulesService.minDoorWidth.entrance. */
export const ENTRY_DOOR_WIDTH_M = 0.9
/** Common residential door height. */
export const DOOR_HEIGHT_M = 2.1

/** Ordinul MS 119/2014 window-to-floor ratio (1/6…1/10 range, 1/8 default). */
export const WINDOW_TO_FLOOR_RATIO = 1 / 8
/** Common residential window height. */
export const WINDOW_HEIGHT_M = 1.2
/** Common residential parapet height (below-the-window sill). */
export const WINDOW_SILL_HEIGHT_M = 0.9
/** Higher sill for bathroom/kitchen privacy. */
export const HIGH_SILL_HEIGHT_M = 1.4
/** Snap window widths to this residential module — matches common frame sizes. */
const WINDOW_WIDTH_MODULES_M = [0.6, 0.9, 1.2, 1.5, 1.8, 2.4]

/**
 * Distance a door's jamb must sit off either wall end — clears a corner
 * tie-column (S1, per CR6-2013; see confined-masonry.ts) and leaves room for
 * the wall's structural end without needing a load-bearing lintel over the
 * very edge. 0.25 m matches the TIE_COLUMN_CROSS_SECTION_MM (250 mm) used
 * for CR6-2013 confining columns.
 */
export const DOOR_JAMB_CLEAR_M = 0.25

/** Same tolerance used by wall-generation for matching room edges to wall lines. */
const EDGE_MATCH_TOLERANCE_M = 0.5

export interface SolvedRoomFootprint {
  id: string
  type: string
  floor: number
  posX: number
  posY: number
  widthM: number
  depthM: number
}

export interface GeneratedOpening {
  /** Reference into the generated wall set — matches the wall's index in the input array. */
  wallIndex: number
  type: 'DOOR' | 'WINDOW' | 'ENTRY_DOOR'
  /** Distance from the wall's start point to the opening's near jamb, meters. */
  position: number
  widthM: number
  heightM: number
  sillHeightM: number
  /** Which room this opening primarily belongs to (for interior doors, the smaller-id room). */
  roomId: string
}

function isBathroom(type: string): boolean {
  const t = type.toLowerCase()
  return t.includes('bath') || t.includes('baie') || t.includes('furdo') || t.includes('toilet') || t.includes('wc')
}
function isKitchen(type: string): boolean {
  const t = type.toLowerCase()
  return t.includes('kitchen') || t.includes('bucatarie') || t.includes('konyha')
}
function isEntryHall(type: string): boolean {
  const t = type.toLowerCase()
  return t.includes('entry') || t.includes('foyer') || t.includes('hall') || t.includes('hol')
}
function isLivingRoom(type: string): boolean {
  const t = type.toLowerCase()
  return t.includes('living') || t.includes('nappali') || t.includes('salon')
}
function isPublic(type: string): boolean {
  return isLivingRoom(type) || isKitchen(type) || isEntryHall(type) ||
    /(dining|sufragerie|etkezo|zi)/.test(type.toLowerCase())
}

/**
 * Does one axis-aligned room edge lie along a wall segment? Wall segments are
 * either horizontal (startY==endY) or vertical (startX==endX); tests the
 * wall's line-coordinate against the appropriate room-edge coord, and
 * requires an interval overlap along the run direction.
 */
function wallRunsAlongRoomEdge(
  wall: GeneratedWallSegment,
  room: SolvedRoomFootprint,
): { edge: 'north' | 'south' | 'east' | 'west' } | null {
  if (wall.floor !== room.floor) return null
  const tol = EDGE_MATCH_TOLERANCE_M
  const isHorizontal = Math.abs(wall.startY - wall.endY) < 1e-6
  const isVertical = Math.abs(wall.startX - wall.endX) < 1e-6
  if (!isHorizontal && !isVertical) return null

  if (isHorizontal) {
    const wallY = wall.startY
    const wallXMin = Math.min(wall.startX, wall.endX)
    const wallXMax = Math.max(wall.startX, wall.endX)
    // Interval must overlap the room's X extent — a wall passing edge-adjacent to but not along a room shouldn't match.
    if (wallXMax <= room.posX + tol || wallXMin >= room.posX + room.widthM - tol) return null
    if (Math.abs(wallY - room.posY) < tol) return { edge: 'south' } // -Y edge in local coords
    if (Math.abs(wallY - (room.posY + room.depthM)) < tol) return { edge: 'north' } // +Y edge
    return null
  }
  const wallX = wall.startX
  const wallYMin = Math.min(wall.startY, wall.endY)
  const wallYMax = Math.max(wall.startY, wall.endY)
  if (wallYMax <= room.posY + tol || wallYMin >= room.posY + room.depthM - tol) return null
  if (Math.abs(wallX - room.posX) < tol) return { edge: 'west' }
  if (Math.abs(wallX - (room.posX + room.widthM)) < tol) return { edge: 'east' }
  return null
}

function wallLength(w: GeneratedWallSegment): number {
  const dx = w.endX - w.startX
  const dy = w.endY - w.startY
  return Math.sqrt(dx * dx + dy * dy)
}

/** Rounds a computed window width to the nearest residential module, floored at 0.6 m. */
function snapWindowWidth(desiredWidthM: number): number {
  let best = WINDOW_WIDTH_MODULES_M[0]
  let bestDelta = Math.abs(desiredWidthM - best)
  for (const m of WINDOW_WIDTH_MODULES_M) {
    const d = Math.abs(desiredWidthM - m)
    if (d < bestDelta) {
      best = m
      bestDelta = d
    }
  }
  return best
}

interface WallRoomAssoc {
  wallIndex: number
  wall: GeneratedWallSegment
  rooms: Array<{ room: SolvedRoomFootprint; edge: 'north' | 'south' | 'east' | 'west' }>
}

function associateWallsToRooms(
  walls: GeneratedWallSegment[],
  rooms: SolvedRoomFootprint[],
): WallRoomAssoc[] {
  return walls.map((wall, wallIndex) => {
    const assoc: WallRoomAssoc = { wallIndex, wall, rooms: [] }
    for (const room of rooms) {
      const hit = wallRunsAlongRoomEdge(wall, room)
      if (hit) assoc.rooms.push({ room, edge: hit.edge })
    }
    return assoc
  })
}

/**
 * Compute the openings for one floor. `entryRoomId`, if given, receives the
 * entry-door on its most public-facing exterior wall.
 */
function generateFloorOpenings(
  walls: GeneratedWallSegment[],
  rooms: SolvedRoomFootprint[],
  entryRoomId: string | null,
): GeneratedOpening[] {
  const openings: GeneratedOpening[] = []
  const associations = associateWallsToRooms(walls, rooms)

  // Target window area per room to hit the 1/8 natural-light ratio.
  const targetWindowAreaPerRoom = new Map<string, number>()
  for (const room of rooms) {
    targetWindowAreaPerRoom.set(room.id, room.widthM * room.depthM * WINDOW_TO_FLOOR_RATIO)
  }

  // Rank exterior walls per room by facade preference (+Y = south = most desirable) —
  // preferred facades get the first window budget, so a room facing +Y and a service wall
  // both exist, the sun-facing one wins.
  const facadePreference: Record<string, number> = { north: 0, south: 3, east: 2, west: 1 }

  for (const assoc of associations) {
    const wall = assoc.wall
    const run = wallLength(wall)
    const usableRun = run - 2 * DOOR_JAMB_CLEAR_M
    if (usableRun <= 0) continue

    if (assoc.rooms.length === 2 && !wall.isExterior) {
      // Interior partition between two rooms → one door, centered.
      const [a, b] = assoc.rooms
      const owner = a.room.id < b.room.id ? a.room : b.room
      const other = owner === a.room ? b.room : a.room
      const bath = isBathroom(other.type) || isBathroom(owner.type)
      const width = bath ? BATHROOM_DOOR_WIDTH_M : INTERIOR_DOOR_WIDTH_M
      if (width > usableRun) continue
      const position = (run - width) / 2
      openings.push({
        wallIndex: assoc.wallIndex,
        type: 'DOOR',
        position: Math.round(position * 100) / 100,
        widthM: width,
        heightM: DOOR_HEIGHT_M,
        sillHeightM: 0,
        roomId: owner.id,
      })
    }
  }

  // Rank exterior walls per room, most-preferred facade first.
  const exteriorByRoom = new Map<
    string,
    Array<{ assoc: WallRoomAssoc; edge: 'north' | 'south' | 'east' | 'west' }>
  >()
  for (const assoc of associations) {
    if (!assoc.wall.isExterior || assoc.rooms.length === 0) continue
    for (const { room, edge } of assoc.rooms) {
      const list = exteriorByRoom.get(room.id) ?? []
      list.push({ assoc, edge })
      exteriorByRoom.set(room.id, list)
    }
  }

  for (const walls of exteriorByRoom.values()) {
    walls.sort((a, b) => facadePreference[b.edge] - facadePreference[a.edge])
  }

  // Entry door first (before windows can eat into the same wall's usable run).
  if (entryRoomId) {
    const entryWalls = exteriorByRoom.get(entryRoomId) ?? []
    for (const { assoc } of entryWalls) {
      const run = wallLength(assoc.wall)
      const usableRun = run - 2 * DOOR_JAMB_CLEAR_M
      if (usableRun < ENTRY_DOOR_WIDTH_M) continue
      const position = (run - ENTRY_DOOR_WIDTH_M) / 2
      openings.push({
        wallIndex: assoc.wallIndex,
        type: 'ENTRY_DOOR',
        position: Math.round(position * 100) / 100,
        widthM: ENTRY_DOOR_WIDTH_M,
        heightM: DOOR_HEIGHT_M,
        sillHeightM: 0,
        roomId: entryRoomId,
      })
      break
    }
  }

  // Windows: for each room, place windows on preferred facades until the
  // target window area is met.
  for (const [roomId, wallList] of exteriorByRoom.entries()) {
    const room = rooms.find((r) => r.id === roomId)
    if (!room) continue
    // Exterior rooms (terrace/balcony) don't need windows.
    const t = room.type.toLowerCase()
    if (/(terrace|terasa|terasz|balcony|balcon|erkely|garage|garaj|garazs)/.test(t)) continue

    const sillHeight = isBathroom(room.type) || isKitchen(room.type) ? HIGH_SILL_HEIGHT_M : WINDOW_SILL_HEIGHT_M
    const target = targetWindowAreaPerRoom.get(roomId) ?? 0
    let placed = 0

    for (const { assoc } of wallList) {
      if (placed >= target) break
      const run = wallLength(assoc.wall)
      // If entry door is already on this wall, reserve its slot.
      const doorHere = openings.find((o) => o.wallIndex === assoc.wallIndex && o.type === 'ENTRY_DOOR')
      const reserved = doorHere ? doorHere.widthM + 2 * DOOR_JAMB_CLEAR_M : 0
      const usableRun = run - 2 * DOOR_JAMB_CLEAR_M - reserved
      if (usableRun < WINDOW_WIDTH_MODULES_M[0]) continue

      const remaining = target - placed
      const desiredWidth = remaining / WINDOW_HEIGHT_M
      const width = Math.min(snapWindowWidth(desiredWidth), Math.floor(usableRun * 10) / 10)
      if (width < WINDOW_WIDTH_MODULES_M[0]) continue

      // Center the window on the free portion of the wall (behind the door if one is here).
      const startFree = doorHere ? doorHere.position + doorHere.widthM + DOOR_JAMB_CLEAR_M : DOOR_JAMB_CLEAR_M
      const endFree = run - DOOR_JAMB_CLEAR_M
      const position = (startFree + endFree - width) / 2
      openings.push({
        wallIndex: assoc.wallIndex,
        type: 'WINDOW',
        position: Math.round(position * 100) / 100,
        widthM: width,
        heightM: WINDOW_HEIGHT_M,
        sillHeightM: sillHeight,
        roomId,
      })
      placed += width * WINDOW_HEIGHT_M
    }
  }

  return openings
}

function pickEntryRoom(rooms: SolvedRoomFootprint[]): string | null {
  const ground = rooms.filter((r) => r.floor === 0)
  const entry = ground.find((r) => isEntryHall(r.type))
  if (entry) return entry.id
  const living = ground.find((r) => isLivingRoom(r.type))
  if (living) return living.id
  const publicRooms = ground.filter((r) => isPublic(r.type))
  if (publicRooms.length > 0) {
    return publicRooms.reduce((a, b) => (a.widthM * a.depthM >= b.widthM * b.depthM ? a : b)).id
  }
  return ground[0]?.id ?? null
}

/**
 * Derive an opening set (interior doors, exterior windows, one entry door)
 * from the solved rooms + their generated walls. Deterministic. Called per
 * house after wall regeneration, in the same "delete + recreate" flow.
 */
export function generateOpenings(
  walls: GeneratedWallSegment[],
  rooms: SolvedRoomFootprint[],
): GeneratedOpening[] {
  if (walls.length === 0 || rooms.length === 0) return []
  const entryRoomId = pickEntryRoom(rooms)

  const floors = [...new Set(walls.map((w) => w.floor))].sort((a, b) => a - b)
  const openings: GeneratedOpening[] = []
  // Only the ground floor gets an entry door — upper floors are reached via a
  // stair, which this project has no model for yet, so no exterior door there.
  for (const floor of floors) {
    const floorWalls = walls.map((w, i) => ({ wall: w, index: i })).filter((x) => x.wall.floor === floor)
    const floorRooms = rooms.filter((r) => r.floor === floor)
    // Rebuild the per-floor wall array while preserving original global indices.
    const wallSubset = floorWalls.map((x) => x.wall)
    const local = generateFloorOpenings(wallSubset, floorRooms, floor === 0 ? entryRoomId : null)
    for (const o of local) {
      openings.push({ ...o, wallIndex: floorWalls[o.wallIndex].index })
    }
  }
  return openings
}
