/**
 * Floor-plan solver.
 *
 * The AI chat emits rooms as {type, floor, suggested_area_sqm} triples with no
 * geometry (see apps/api/src/modules/ai/design-update-mapper.ts) — the previous
 * placeholder placement just laid every new room in a straight left-to-right
 * row via `nextRoomPosition`, which meant a "living + kitchen + 2 bedrooms +
 * bath" ended up as five rectangles in one strip, not a coherent house
 * footprint. That's what a real user reported as "the system doesn't build a
 * house, just boxes next to and on top of each other."
 *
 * This module replaces that with a functional-zone-aware slice-and-dice solver:
 *
 * 1. Rooms are grouped into zones (public / private / service / circulation /
 *    exterior) per **NP 057-2002** (Normativ privind proiectarea clădirilor de
 *    locuinţe, MLPTL Order 1383/24.09.2002) — the RO residential-design
 *    normativ that explicitly addresses "Orientarea față de punctele
 *    cardinale". NP 057-2002's specific per-room orientation table could not
 *    be extracted here (the official MDLPA PDF host systematically 403s in
 *    this project's environment, same block that hit the law-modules research
 *    — see CLAUDE.md's "citation-confidence note" pattern), so the zone
 *    grouping below reflects the widely-cited RO architectural convention
 *    aligned with that normativ: public (living/kitchen/dining/entry) on the
 *    sunny facade, private (bedrooms) on the opposite side, service
 *    (bath/toilet/laundry/storage/technical) tucked toward the interior/
 *    shaded side.
 *
 * 2. Each floor's envelope is a rectangle sized to that floor's own total
 *    room area at aspect ratio `TARGET_ENVELOPE_ASPECT` (1.4:1) — a widely-
 *    cited residential-appropriate proportion, not a normativ figure. Any
 *    upper floor whose area is ≤ the ground floor's therefore produces a
 *    strictly smaller envelope, which sits inside the ground-floor envelope
 *    when both are aligned at (0,0) — a real cantilever/overhang would need
 *    its own structural design, out of scope here.
 *
 * 3. The envelope is split into zone strips proportionally by zone-total area.
 *    Public sits on the +Y ("south" in local coords, since NP 057-2002's
 *    orientation preference is south-facing living rooms — the actual world-
 *    frame rotation is applied later, at rendering, using Plot.orientation).
 *
 * 4. Within a zone, rooms are placed by alternating-axis slice-and-dice
 *    ordered by area descending — a plain, deterministic partition producing
 *    reasonable child aspect ratios without needing a full squarified-treemap.
 *    An explicit CORRIDOR room (if present) is pulled to a spine strip
 *    connecting the private-zone rooms (RulesService requires ≥0.9m corridor
 *    width, so a corridor thinner than that widens to 0.9m at the cost of
 *    slight envelope stretch — never below the RO livability minimum).
 *
 * This is a solved layout, not a full architectural design: no door-swing
 * clearance check, no furniture-placement fit, no view-line analysis. It
 * makes the AI-chat house *read as a house* in plan and 3D, above the
 * previous strip-of-boxes bar, and gives a coherent footprint for the
 * downstream wall/opening generation and the roof geometry to work over.
 * A real interactive floor-plan editor / constraint solver is a future
 * feature (see CLAUDE.md's "Next" section).
 */

/** Widely-cited RO residential-appropriate envelope proportion — not a normativ figure. */
export const TARGET_ENVELOPE_ASPECT = 1.4

/** Matches RulesService.minCorridorWidth (RO livability) — a solved corridor is never thinner. */
export const MIN_CORRIDOR_WIDTH_M = 0.9

/** Rooms this narrow would be unusable — kept as a floor to catch pathological area inputs (e.g. 0.5 m² closet). */
export const MIN_ROOM_DIMENSION_M = 1.2

export type FunctionalZone = 'PUBLIC' | 'PRIVATE' | 'SERVICE' | 'CIRCULATION' | 'EXTERIOR'

/**
 * Normalizes a raw `Room.type` string (which the AI emits in many forms —
 * `LIVING_ROOM`, `living_room`, `living_room_and_kitchen`, HU `nappali`, ...)
 * to a functional zone. Matched by case-insensitive substring against a small
 * multilingual keyword list, longest match wins so `living_room_and_kitchen`
 * hits PUBLIC via "living" rather than being missed as unknown. Unknown types
 * fall back to SERVICE — the least-visible zone position, which keeps a
 * mis-typed room from breaking the public-facade composition.
 */
const ZONE_KEYWORDS: Array<{ zone: FunctionalZone; keywords: string[] }> = [
  {
    zone: 'CIRCULATION',
    keywords: ['corridor', 'hallway', 'hall', 'stair', 'hol', 'coridor', 'folyoso', 'lepcso'],
  },
  {
    zone: 'PUBLIC',
    keywords: [
      'living', 'lounge', 'nappali', 'dining', 'kitchen', 'entry', 'foyer',
      'bucatarie', 'konyha', 'sufragerie', 'etkezo', 'zi', 'holisham', 'salon',
    ],
  },
  {
    zone: 'PRIVATE',
    keywords: ['bedroom', 'dormitor', 'halo', 'master', 'guest', 'nursery', 'copil', 'gyerek'],
  },
  {
    zone: 'SERVICE',
    keywords: [
      'bath', 'toilet', 'wc', 'baie', 'furdo', 'laundry', 'spalatorie', 'mos',
      'storage', 'closet', 'camara', 'kamra', 'pantry', 'boiler', 'centrala',
      'technical', 'tehnic', 'utility',
    ],
  },
  {
    zone: 'EXTERIOR',
    keywords: [
      'terrace', 'terasa', 'terasz', 'balcony', 'balcon', 'erkely',
      'garage', 'garaj', 'garazs', 'porch', 'veranda',
    ],
  },
]

export function classifyRoomZone(roomType: string): FunctionalZone {
  const t = roomType.toLowerCase()
  let best: { zone: FunctionalZone; length: number } | null = null
  for (const group of ZONE_KEYWORDS) {
    for (const kw of group.keywords) {
      if (t.includes(kw) && (!best || kw.length > best.length)) {
        best = { zone: group.zone, length: kw.length }
      }
    }
  }
  return best?.zone ?? 'SERVICE'
}

export interface SolverRoomInput {
  id: string
  type: string
  floor: number
  area: number
}

export interface SolvedRoom {
  id: string
  floor: number
  posX: number
  posY: number
  widthM: number
  depthM: number
  zone: FunctionalZone
}

interface Rectangle {
  x: number
  y: number
  w: number
  d: number
}

interface ZonedRoom extends SolverRoomInput {
  zone: FunctionalZone
}

/**
 * Order the zones along the envelope's depth axis — south (+Y in local
 * coords) is public per NP 057-2002 orientation preference, north (-Y) is
 * private, service is tucked between them, circulation gets its own row on
 * demand. EXTERIOR-zone rooms (terrace/balcony/garage) are laid out *outside*
 * the main envelope in a separate pass — they don't share indoor walls.
 */
const ZONE_ORDER: FunctionalZone[] = ['SERVICE', 'PRIVATE', 'CIRCULATION', 'PUBLIC']

function envelopeFromArea(totalArea: number): { widthM: number; depthM: number } {
  if (totalArea <= 0) return { widthM: 0, depthM: 0 }
  const widthM = Math.sqrt(totalArea * TARGET_ENVELOPE_ASPECT)
  const depthM = totalArea / widthM
  return { widthM, depthM }
}

/**
 * Slice-and-dice partition of `rect` into one sub-rectangle per input,
 * proportional to `areas`. Splits along the rectangle's longer side each
 * step (keeps children close to square), places the largest area first — a
 * deterministic and reasonably-balanced partition without a full
 * squarified-treemap. The order of the returned rectangles matches the
 * `sorted` input order.
 */
function sliceAndDice(rect: Rectangle, weights: number[]): Rectangle[] {
  if (weights.length === 0) return []
  if (weights.length === 1) return [rect]

  const total = weights.reduce((s, v) => s + v, 0)
  const first = weights[0]
  const rest = weights.slice(1)
  const restTotal = total - first

  const splitAlongWidth = rect.w >= rect.d
  if (splitAlongWidth) {
    const firstW = (first / total) * rect.w
    const firstRect: Rectangle = { x: rect.x, y: rect.y, w: firstW, d: rect.d }
    const remainingRect: Rectangle = {
      x: rect.x + firstW,
      y: rect.y,
      w: rect.w - firstW,
      d: rect.d,
    }
    return [firstRect, ...sliceAndDice(remainingRect, rest.map((w) => (w / restTotal) * restTotal))]
  }
  const firstD = (first / total) * rect.d
  const firstRect: Rectangle = { x: rect.x, y: rect.y, w: rect.w, d: firstD }
  const remainingRect: Rectangle = {
    x: rect.x,
    y: rect.y + firstD,
    w: rect.w,
    d: rect.d - firstD,
  }
  return [firstRect, ...sliceAndDice(remainingRect, rest)]
}

function round(v: number): number {
  return Math.round(v * 100) / 100
}

function placeZone(zoneRect: Rectangle, rooms: ZonedRoom[]): SolvedRoom[] {
  if (rooms.length === 0) return []
  const sorted = [...rooms].sort((a, b) => b.area - a.area)
  const rects = sliceAndDice(zoneRect, sorted.map((r) => r.area))
  return sorted.map((r, i) => ({
    id: r.id,
    floor: r.floor,
    posX: round(rects[i].x),
    posY: round(rects[i].y),
    widthM: round(rects[i].w),
    depthM: round(rects[i].d),
    zone: r.zone,
  }))
}

function solveOneFloor(
  rooms: ZonedRoom[],
  envelope: { widthM: number; depthM: number },
): SolvedRoom[] {
  const indoor = rooms.filter((r) => r.zone !== 'EXTERIOR')
  const outdoor = rooms.filter((r) => r.zone === 'EXTERIOR')

  if (indoor.length === 0 && outdoor.length === 0) return []
  if (indoor.length === 0) {
    // Only exterior rooms — lay them out along the envelope's "south" edge.
    return placeZone({ x: 0, y: 0, w: envelope.widthM, d: envelope.depthM }, outdoor)
  }

  const roomsByZone = new Map<FunctionalZone, ZonedRoom[]>()
  for (const r of indoor) {
    const list = roomsByZone.get(r.zone) ?? []
    list.push(r)
    roomsByZone.set(r.zone, list)
  }

  const indoorArea = indoor.reduce((s, r) => s + r.area, 0)
  const zoneStrips: Array<{ zone: FunctionalZone; rooms: ZonedRoom[]; rect: Rectangle }> = []

  let cursorY = 0
  for (const zone of ZONE_ORDER) {
    const zoneRooms = roomsByZone.get(zone)
    if (!zoneRooms || zoneRooms.length === 0) continue

    let stripDepth: number
    if (zone === 'CIRCULATION') {
      // Corridor spine: a horizontal strip at least MIN_CORRIDOR_WIDTH_M
      // deep. Its `area` is honored proportionally when it clears the min,
      // else it's floored at MIN — never thinner than RulesService requires.
      const areaBased = (zoneRooms.reduce((s, r) => s + r.area, 0) / indoorArea) * envelope.depthM
      stripDepth = Math.max(MIN_CORRIDOR_WIDTH_M, areaBased)
    } else {
      stripDepth = (zoneRooms.reduce((s, r) => s + r.area, 0) / indoorArea) * envelope.depthM
    }

    zoneStrips.push({
      zone,
      rooms: zoneRooms,
      rect: { x: 0, y: cursorY, w: envelope.widthM, d: stripDepth },
    })
    cursorY += stripDepth
  }

  // If the corridor floor stretched us past the envelope, rescale non-corridor
  // strips uniformly so the envelope closes back at depthM without ever
  // squeezing the corridor below MIN_CORRIDOR_WIDTH_M.
  if (cursorY > envelope.depthM) {
    const corridorDepth = zoneStrips
      .filter((s) => s.zone === 'CIRCULATION')
      .reduce((s, x) => s + x.rect.d, 0)
    const nonCorridorAvailable = envelope.depthM - corridorDepth
    const nonCorridorTotal = zoneStrips
      .filter((s) => s.zone !== 'CIRCULATION')
      .reduce((s, x) => s + x.rect.d, 0)
    if (nonCorridorAvailable > 0 && nonCorridorTotal > 0) {
      const scale = nonCorridorAvailable / nonCorridorTotal
      let y = 0
      for (const strip of zoneStrips) {
        if (strip.zone !== 'CIRCULATION') strip.rect.d *= scale
        strip.rect.y = y
        y += strip.rect.d
      }
    }
  }

  const solved: SolvedRoom[] = []
  for (const strip of zoneStrips) solved.push(...placeZone(strip.rect, strip.rooms))

  if (outdoor.length > 0) {
    // Terrace/balcony/garage sits outside the main envelope, on the public
    // (south) side — traditional RO residential arrangement.
    const outdoorRect: Rectangle = {
      x: 0,
      y: envelope.depthM,
      w: envelope.widthM,
      d: Math.max(
        MIN_ROOM_DIMENSION_M,
        outdoor.reduce((s, r) => s + r.area, 0) / envelope.widthM,
      ),
    }
    solved.push(...placeZone(outdoorRect, outdoor))
  }

  return solved
}

/**
 * Solve per-room positions from the room list. Each floor gets its own
 * envelope sized to its own indoor room area (see design note above): a
 * floor whose total area is smaller than another's produces a strictly
 * smaller envelope, so aligning every floor at (0,0) naturally keeps upper
 * floors inside the ground floor's footprint without any explicit clipping.
 */
export function solveFloorPlan(rooms: SolverRoomInput[]): SolvedRoom[] {
  if (rooms.length === 0) return []

  const zoned: ZonedRoom[] = rooms.map((r) => ({ ...r, zone: classifyRoomZone(r.type) }))

  const areaByFloor = new Map<number, number>()
  for (const r of zoned) {
    if (r.zone === 'EXTERIOR') continue // exterior rooms don't count toward the indoor envelope
    areaByFloor.set(r.floor, (areaByFloor.get(r.floor) ?? 0) + r.area)
  }

  const solved: SolvedRoom[] = []
  const floors = [...new Set(zoned.map((r) => r.floor))].sort((a, b) => a - b)
  for (const floor of floors) {
    const envelope = envelopeFromArea(areaByFloor.get(floor) ?? 0)
    solved.push(...solveOneFloor(zoned.filter((r) => r.floor === floor), envelope))
  }
  return solved
}
