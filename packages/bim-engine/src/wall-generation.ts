/**
 * Wall generation from room footprints.
 *
 * The AI chat only ever emits rooms (ADD_ROOM/UPDATE_ROOM with a suggested
 * area) — it has never been observed to emit usable ADD_WALL geometry — so a
 * house designed purely through the conversation used to have no walls at
 * all: nothing for the 3D viewer to extrude, nothing for the brick-coursing
 * detail tier to course, nothing for the cost engine's wall BOQ. This module
 * derives a placeholder wall set from the room rectangles instead:
 *
 * - every room-perimeter edge segment shared by two rooms becomes ONE
 *   interior partition wall;
 * - every remaining perimeter segment becomes an exterior load-bearing wall;
 * - collinear-ish edges are clustered (see LINE_CLUSTER_TOLERANCE_M) so the
 *   0.3m placeholder gap the AI room mapper leaves between neighbouring
 *   rooms reads as one shared wall line, not two parallel walls with a slit.
 *
 * Like the room rectangles themselves (see design-update-mapper.ts's
 * ROOM_ASPECT_RATIO note), this is honest placeholder geometry, not a solved
 * floor plan: it makes the house *look and quantify* like a house until a
 * real layout solver exists. Thicknesses intentionally match the default
 * wall assemblies HousesService auto-provisions (Leiertherm 38 exterior /
 * 240mm solid-brick partition), so the generated walls pick up real material
 * stacks — and therefore real brick coursing — with no extra wiring.
 */

/** Extents are meters; a room occupies [posX, posX+widthM] × [posY, posY+depthM]. */
export interface RoomFootprint {
  id: string
  floor: number
  posX: number
  posY: number
  widthM: number
  depthM: number
}

export interface GeneratedWallSegment {
  floor: number
  startX: number
  startY: number
  endX: number
  endY: number
  thicknessM: number
  isExterior: boolean
  isLoadBearing: boolean
}

/** Matches the default exterior assembly's structural layer (Leiertherm 38 N+F, 380mm). */
export const GENERATED_EXTERIOR_WALL_THICKNESS_M = 0.38
/** Matches the default interior assembly's structural layer (Cărămidă plină arsă, 240mm). */
export const GENERATED_INTERIOR_WALL_THICKNESS_M = 0.24

/**
 * Two parallel room edges closer than this are treated as the same wall
 * line (placed at their average position). Chosen to swallow the AI room
 * mapper's 0.3m inter-room placeholder gap plus rounding, while staying
 * safely below any real room dimension (a legal corridor is ≥1m wide, so a
 * room's own opposite edges can never cluster).
 */
export const LINE_CLUSTER_TOLERANCE_M = 0.45

/** Segments shorter than this are dropped as degenerate slivers. */
const MIN_WALL_SEGMENT_M = 0.05

const MM = 1000

interface EdgeEntry {
  /** Interval along the line, mm. */
  a: number
  b: number
  /** +1 when the room lies on the positive-coordinate side of the line. */
  side: 1 | -1
}

interface LineCluster {
  coordMm: number
  edges: EdgeEntry[]
}

/**
 * Greedy gap-clustering of line coordinates: consecutive sorted positions
 * within the tolerance join the same cluster, whose coordinate is the mean
 * of its members.
 */
function clusterLineCoords(coordsMm: number[], toleranceMm: number): Map<number, number> {
  const sorted = [...new Set(coordsMm)].sort((x, y) => x - y)
  const mapping = new Map<number, number>()
  let cluster: number[] = []

  const flush = () => {
    if (cluster.length === 0) return
    const mean = Math.round(cluster.reduce((s, v) => s + v, 0) / cluster.length)
    for (const v of cluster) mapping.set(v, mean)
    cluster = []
  }

  for (const coord of sorted) {
    if (cluster.length > 0 && coord - cluster[cluster.length - 1] > toleranceMm) flush()
    cluster.push(coord)
  }
  flush()
  return mapping
}

/** Snap an interval endpoint onto the nearest perpendicular wall line within tolerance (closes corners). */
function snapToClusters(valueMm: number, clusterCoords: number[], toleranceMm: number): number {
  let best = valueMm
  let bestDist = toleranceMm + 1
  for (const coord of clusterCoords) {
    const dist = Math.abs(coord - valueMm)
    if (dist <= toleranceMm && dist < bestDist) {
      best = coord
      bestDist = dist
    }
  }
  return best
}

interface ClassifiedRun {
  a: number
  b: number
  isExterior: boolean
}

/**
 * Split one wall line into atomic segments at every edge endpoint, classify
 * each by which sides of the line have a room (both → interior partition,
 * one → exterior facade), then merge adjacent same-class runs.
 */
function classifyLine(edges: EdgeEntry[]): ClassifiedRun[] {
  const breakpoints = [...new Set(edges.flatMap((e) => [e.a, e.b]))].sort((x, y) => x - y)
  const runs: ClassifiedRun[] = []

  for (let i = 0; i < breakpoints.length - 1; i++) {
    const a = breakpoints[i]
    const b = breakpoints[i + 1]
    if (b - a <= 0) continue
    const mid = (a + b) / 2
    let hasPositive = false
    let hasNegative = false
    for (const edge of edges) {
      if (mid <= edge.a || mid >= edge.b) continue
      if (edge.side === 1) hasPositive = true
      else hasNegative = true
    }
    if (!hasPositive && !hasNegative) continue

    const isExterior = !(hasPositive && hasNegative)
    const previous = runs[runs.length - 1]
    if (previous && previous.b === a && previous.isExterior === isExterior) {
      previous.b = b
    } else {
      runs.push({ a, b, isExterior })
    }
  }

  return runs.filter((run) => run.b - run.a >= MIN_WALL_SEGMENT_M * MM)
}

function deriveFloorWalls(rooms: RoomFootprint[], floor: number): GeneratedWallSegment[] {
  const toleranceMm = LINE_CLUSTER_TOLERANCE_M * MM

  interface RawEdge {
    lineCoordMm: number
    a: number
    b: number
    side: 1 | -1
  }
  const horizontal: RawEdge[] = []
  const vertical: RawEdge[] = []

  for (const room of rooms) {
    const x0 = Math.round(room.posX * MM)
    const x1 = Math.round((room.posX + room.widthM) * MM)
    const y0 = Math.round(room.posY * MM)
    const y1 = Math.round((room.posY + room.depthM) * MM)
    if (x1 - x0 <= 0 || y1 - y0 <= 0) continue
    horizontal.push({ lineCoordMm: y0, a: x0, b: x1, side: 1 })
    horizontal.push({ lineCoordMm: y1, a: x0, b: x1, side: -1 })
    vertical.push({ lineCoordMm: x0, a: y0, b: y1, side: 1 })
    vertical.push({ lineCoordMm: x1, a: y0, b: y1, side: -1 })
  }

  const horizontalLineMap = clusterLineCoords(horizontal.map((e) => e.lineCoordMm), toleranceMm)
  const verticalLineMap = clusterLineCoords(vertical.map((e) => e.lineCoordMm), toleranceMm)
  const horizontalLineCoords = [...new Set(horizontalLineMap.values())]
  const verticalLineCoords = [...new Set(verticalLineMap.values())]

  // Snap each edge's endpoints onto the perpendicular wall lines so facades
  // meet interior walls (and each other) exactly at corners instead of
  // leaving gap-width slits.
  const byLine = (edges: RawEdge[], lineMap: Map<number, number>, perpCoords: number[]) => {
    const lines = new Map<number, LineCluster>()
    for (const edge of edges) {
      const coordMm = lineMap.get(edge.lineCoordMm)!
      const a = snapToClusters(edge.a, perpCoords, toleranceMm)
      const b = snapToClusters(edge.b, perpCoords, toleranceMm)
      if (b - a <= 0) continue
      const line = lines.get(coordMm) ?? { coordMm, edges: [] }
      line.edges.push({ a, b, side: edge.side })
      lines.set(coordMm, line)
    }
    return lines
  }

  const walls: GeneratedWallSegment[] = []
  const toM = (mm: number) => Math.round(mm) / MM

  for (const line of byLine(horizontal, horizontalLineMap, verticalLineCoords).values()) {
    for (const run of classifyLine(line.edges)) {
      walls.push({
        floor,
        startX: toM(run.a),
        startY: toM(line.coordMm),
        endX: toM(run.b),
        endY: toM(line.coordMm),
        thicknessM: run.isExterior
          ? GENERATED_EXTERIOR_WALL_THICKNESS_M
          : GENERATED_INTERIOR_WALL_THICKNESS_M,
        isExterior: run.isExterior,
        isLoadBearing: run.isExterior,
      })
    }
  }
  for (const line of byLine(vertical, verticalLineMap, horizontalLineCoords).values()) {
    for (const run of classifyLine(line.edges)) {
      walls.push({
        floor,
        startX: toM(line.coordMm),
        startY: toM(run.a),
        endX: toM(line.coordMm),
        endY: toM(run.b),
        thicknessM: run.isExterior
          ? GENERATED_EXTERIOR_WALL_THICKNESS_M
          : GENERATED_INTERIOR_WALL_THICKNESS_M,
        isExterior: run.isExterior,
        isLoadBearing: run.isExterior,
      })
    }
  }

  return walls
}

/**
 * Derives the full generated wall set for a house from its room rectangles,
 * independently per floor. Rooms with a non-positive extent are skipped.
 */
export function deriveWallsFromRooms(rooms: RoomFootprint[]): GeneratedWallSegment[] {
  const byFloor = new Map<number, RoomFootprint[]>()
  for (const room of rooms) {
    const list = byFloor.get(room.floor) ?? []
    list.push(room)
    byFloor.set(room.floor, list)
  }

  const walls: GeneratedWallSegment[] = []
  for (const [floor, floorRooms] of [...byFloor.entries()].sort(([a], [b]) => a - b)) {
    walls.push(...deriveFloorWalls(floorRooms, floor))
  }
  return walls
}
