// Romanian building-code law module #2: confined masonry (zidărie
// confinată) per CR6-2013 — reinforced-concrete tie-columns (stâlpișori)
// embedded in a wall run, and lintels (buiandrugi) over every door/window
// opening. Pure, deterministic geometry + constructive-minimum rules; not a
// load-bearing structural design (see foundation.ts's same disclaimer).
//
// Scope of this module: the S1 (corner/intersection), S2 (max-spacing) and
// S3 (large-opening, seismic-zone-dependent) tie-column categories, plus
// lintels. CR6-2013's three categories:
//   S1 — every wall corner / T / X intersection (always required).
//   S2 — intermediate columns limiting spacing along a run to <= 4–5m.
//   S3 — columns flanking an opening, required ONLY conditionally: in
//        high-seismicity zones (ag >= 0.25g) for openings with area
//        >= 1.5 m², and in the rest of the territory (ag < 0.25g) for
//        openings with area >= 2.5 m². A smaller opening in the same zone
//        gets NO column (the lintel over it plus the S1/S2 columns
//        elsewhere in the run do the tying-together job).
// The two opening-area thresholds and the ag = 0.25g boundary were cross-
// checked across two independent searches converging on identical values
// (see OPENING_CONFINEMENT_* constants). The ag-by-locality input comes from
// seismic.ts (P100-1/2013), which is honest about its citation confidence
// and falls back conservatively (stricter threshold) for an unknown
// locality — so S3 over-provisions rather than under-provisions when the
// site's ag is unknown, never violating Key rule 7 with an invented number.
//
// Still a documented gap (NOT implemented here): the minimum residual
// masonry-pier ("spalet") length below which an opening also triggers
// confinement regardless of its area — this project could not confirm the
// exact threshold against a primary source, so only the area+ag rule is
// applied. An earlier (unshipped) draft treated every opening jamb as S1
// unconditionally; that was wrong and is corrected here — a plain
// below-threshold opening jamb gets no column.

import { HIGH_SEISMICITY_AG_THRESHOLD_G } from './seismic'

export interface WallSegment {
  id: string
  startX: number
  startY: number
  endX: number
  endY: number
  /** Only load-bearing walls (isExterior || isLoad) participate in S1/S2/S3 placement. */
  isLoadBearing: boolean
}

export type TieColumnCategory = 'S1' | 'S2' | 'S3'

export interface TieColumnPlacement {
  x: number
  y: number
  category: TieColumnCategory
}

/**
 * One opening on a wall, in the form the S3 rule needs: which wall it sits
 * on, how far along that wall its near jamb is (meters from the wall's start
 * point), its width (meters), and its area (m² = width × height). Maps 1:1
 * from an `Opening` row (position / width / width×height).
 */
export interface WallOpeningForConfinement {
  wallId: string
  /** Meters from the wall's start point to the near (start-side) jamb. */
  position: number
  /** Opening width in meters. */
  width: number
  /** Opening area in m² (width × height). */
  areaSqm: number
}

// Points within this distance are treated as the same node (walls drawn by
// a user/AI rarely land on the exact same float coordinate). Meters.
const NODE_TOLERANCE_M = 0.05
// Two wall arms meeting at a node are "collinear" (a straight run split
// into two Wall rows, not a real corner) within this angle. Radians.
const COLLINEAR_ANGLE_TOLERANCE_RAD = (5 * Math.PI) / 180
// A point within this fraction of a wall's own length from either of its
// ends is treated as "at the end" (already covered by endpoint clustering)
// rather than a genuine mid-span T-junction.
const MIN_T_JUNCTION_PARAM = 0.02

interface Point {
  x: number
  y: number
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function angleBetween(u: Point, v: Point): number {
  const dot = u.x * v.x + u.y * v.y
  const clamped = Math.max(-1, Math.min(1, dot))
  return Math.acos(clamped)
}

interface EndpointRef {
  wallId: string
  point: Point
  /** Unit vector pointing away from this endpoint, into the wall. */
  direction: Point
}

function unitDirection(from: Point, to: Point): Point {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy)
  return len === 0 ? { x: 0, y: 0 } : { x: dx / len, y: dy / len }
}

/**
 * Distance from point p to the segment [a,b], and the projection parameter
 * t along it (0 at a, 1 at b) — used to detect a wall endpoint landing on
 * another wall's interior span (a T-junction not at a shared endpoint).
 */
function pointToSegment(p: Point, a: Point, b: Point): { dist: number; t: number } {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const lenSq = abx * abx + aby * aby
  if (lenSq === 0) return { dist: distance(p, a), t: 0 }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq))
  const projX = a.x + t * abx
  const projY = a.y + t * aby
  return { dist: distance(p, { x: projX, y: projY }), t }
}

/**
 * S1 tie-column locations: every point where load-bearing walls meet at a
 * corner or T/X intersection — either a shared, non-collinear endpoint
 * cluster, three or more walls sharing an endpoint, or one wall's endpoint
 * landing on another wall's interior span. A straight two-wall join
 * (collinear, i.e. one physical run split into two Wall rows) is correctly
 * NOT a corner and gets no column from this rule.
 */
export function detectCornerAndIntersectionPoints(walls: WallSegment[]): Point[] {
  const bearing = walls.filter((w) => w.isLoadBearing && (w.startX !== w.endX || w.startY !== w.endY))
  if (bearing.length === 0) return []

  const endpoints: EndpointRef[] = []
  for (const w of bearing) {
    const start: Point = { x: w.startX, y: w.startY }
    const end: Point = { x: w.endX, y: w.endY }
    endpoints.push({ wallId: w.id, point: start, direction: unitDirection(start, end) })
    endpoints.push({ wallId: w.id, point: end, direction: unitDirection(end, start) })
  }

  // Cluster endpoints within NODE_TOLERANCE_M of each other (simple greedy
  // grouping — endpoint counts per house are small, O(n^2) is fine).
  const clusters: EndpointRef[][] = []
  for (const ep of endpoints) {
    const cluster = clusters.find((c) => distance(c[0].point, ep.point) <= NODE_TOLERANCE_M)
    if (cluster) cluster.push(ep)
    else clusters.push([ep])
  }

  const results: Point[] = []

  for (const cluster of clusters) {
    const distinctWalls = new Set(cluster.map((e) => e.wallId)).size
    if (distinctWalls >= 3) {
      results.push(cluster[0].point)
    } else if (distinctWalls === 2) {
      const [a, b] = cluster
      // Collinear if the arms point in the same or opposite direction.
      const angle = angleBetween(a.direction, b.direction)
      const isCollinear = angle <= COLLINEAR_ANGLE_TOLERANCE_RAD || Math.PI - angle <= COLLINEAR_ANGLE_TOLERANCE_RAD
      if (!isCollinear) results.push(a.point)
    }
    // distinctWalls === 1: a free wall end with no other wall's endpoint
    // nearby — checked against mid-span T-junctions below instead.
  }

  // Mid-span T-junctions: a wall's endpoint landing on the interior of a
  // different wall (e.g. an interior partition meeting an exterior wall
  // away from its corners).
  for (const w of bearing) {
    for (const endpoint of [{ x: w.startX, y: w.startY }, { x: w.endX, y: w.endY }]) {
      for (const other of bearing) {
        if (other.id === w.id) continue
        const a: Point = { x: other.startX, y: other.startY }
        const b: Point = { x: other.endX, y: other.endY }
        const { dist, t } = pointToSegment(endpoint, a, b)
        if (dist <= NODE_TOLERANCE_M && t > MIN_T_JUNCTION_PARAM && t < 1 - MIN_T_JUNCTION_PARAM) {
          results.push(endpoint)
        }
      }
    }
  }

  // Dedupe final points that ended up within tolerance of each other
  // (a corner detected both by clustering and by a T-junction check).
  const deduped: Point[] = []
  for (const p of results) {
    if (!deduped.some((d) => distance(d, p) <= NODE_TOLERANCE_M)) deduped.push(p)
  }
  return deduped
}

// CR6-2013: max spacing between successive stâlpișori along a wall run is
// cited as 4.00m (sparse wall layout) to 5.00m (dense layout) — this
// project has no "sparse vs dense" classification, so it conservatively
// uses the tighter (safer, more columns) end of that range.
export const MAX_TIE_COLUMN_SPACING_M = 4.0

/**
 * S2 intermediate tie-columns: for each load-bearing wall longer than
 * MAX_TIE_COLUMN_SPACING_M, evenly-spaced points along its length (not
 * including the endpoints themselves, which are covered by S1 if they
 * qualify) so no gap along the wall exceeds the max spacing.
 */
export function detectMidSpanTieColumns(walls: WallSegment[]): Point[] {
  const results: Point[] = []
  for (const w of walls) {
    if (!w.isLoadBearing) continue
    const length = Math.hypot(w.endX - w.startX, w.endY - w.startY)
    if (length <= MAX_TIE_COLUMN_SPACING_M) continue

    const segments = Math.ceil(length / MAX_TIE_COLUMN_SPACING_M)
    const ux = (w.endX - w.startX) / length
    const uy = (w.endY - w.startY) / length
    for (let i = 1; i < segments; i++) {
      const d = (length * i) / segments
      results.push({ x: w.startX + ux * d, y: w.startY + uy * d })
    }
  }
  return results
}

// CR6-2013 opening-confinement (S3) rule: an opening must be flanked by
// tie-columns at both jambs when its area reaches a threshold that depends
// on the site's seismic zone. Both values, and the ag = 0.25g boundary
// between them, were cross-checked across two independently-phrased searches
// converging on identical figures (a "double window", ~1.5 m², in the red
// zone; a "door", ~2.5 m², elsewhere).
export const OPENING_CONFINEMENT_AREA_HIGH_SEISMIC_SQM = 1.5 // ag >= 0.25g
export const OPENING_CONFINEMENT_AREA_LOW_SEISMIC_SQM = 2.5 // ag < 0.25g

/**
 * The minimum opening area (m²) above which CR6-2013 requires S3 tie-columns
 * flanking the opening, for a site with the given design ground acceleration
 * `agG` (fraction of g). High-seismicity sites use the stricter (smaller)
 * threshold.
 */
export function openingConfinementThresholdSqm(agG: number): number {
  return agG >= HIGH_SEISMICITY_AG_THRESHOLD_G
    ? OPENING_CONFINEMENT_AREA_HIGH_SEISMIC_SQM
    : OPENING_CONFINEMENT_AREA_LOW_SEISMIC_SQM
}

/**
 * S3 tie-column locations: for every opening whose area reaches the seismic-
 * zone-dependent confinement threshold, a column at each of its two jambs.
 * An opening on a non-load-bearing wall, or on a wall not present in `walls`,
 * is skipped. Jamb points are computed along the opening's host wall
 * (near jamb at `position`, far jamb at `position + width` from the wall's
 * start point). A below-threshold opening produces no columns.
 */
export function detectOpeningTieColumns(
  walls: WallSegment[],
  openings: WallOpeningForConfinement[],
  agG: number,
): Point[] {
  const threshold = openingConfinementThresholdSqm(agG)
  const byId = new Map(walls.map((w) => [w.id, w]))
  const results: Point[] = []

  for (const opening of openings) {
    if (opening.areaSqm < threshold) continue
    const wall = byId.get(opening.wallId)
    if (!wall || !wall.isLoadBearing) continue

    const start: Point = { x: wall.startX, y: wall.startY }
    const end: Point = { x: wall.endX, y: wall.endY }
    const u = unitDirection(start, end)
    if (u.x === 0 && u.y === 0) continue // zero-length wall

    const nearJamb: Point = { x: start.x + u.x * opening.position, y: start.y + u.y * opening.position }
    const farParam = opening.position + opening.width
    const farJamb: Point = { x: start.x + u.x * farParam, y: start.y + u.y * farParam }
    results.push(nearJamb, farJamb)
  }
  return results
}

/**
 * Full S1+S2+S3 tie-column placement for a house's (single-floor) wall set.
 * Caller passes one floor's walls at a time — this module is 2D/floor-
 * agnostic, matching the rest of bim-engine. S3 (opening-triggered) columns
 * are only produced when `openings` are supplied; `agG` (the site's design
 * ground acceleration, from seismic.ts) selects the confinement threshold.
 * Passing no openings reproduces the original S1+S2-only behavior exactly.
 */
export function deriveTieColumnPlacements(
  walls: WallSegment[],
  openings: WallOpeningForConfinement[] = [],
  agG = HIGH_SEISMICITY_AG_THRESHOLD_G,
): TieColumnPlacement[] {
  const s1 = detectCornerAndIntersectionPoints(walls).map((p) => ({ ...p, category: 'S1' as const }))
  const s2Candidates = detectMidSpanTieColumns(walls)
  // Drop any S2 candidate that lands within tolerance of an S1 point (can
  // happen if a wall's own length is just over the max spacing right next
  // to a corner already covered).
  const s2 = s2Candidates
    .filter((p) => !s1.some((c) => distance(c, p) <= NODE_TOLERANCE_M))
    .map((p) => ({ ...p, category: 'S2' as const }))

  // S3 jambs, deduped against S1/S2 (a jamb landing on an existing corner or
  // mid-span column is already confined — don't double it) and against each
  // other (two adjacent openings sharing a narrow pier).
  const placed: Point[] = [...s1, ...s2]
  const s3: TieColumnPlacement[] = []
  for (const p of detectOpeningTieColumns(walls, openings, agG)) {
    if (placed.some((c) => distance(c, p) <= NODE_TOLERANCE_M)) continue
    placed.push(p)
    s3.push({ ...p, category: 'S3' as const })
  }

  return [...s1, ...s2, ...s3]
}

// CR6-2013 constructive minimums for a stâlpișor: ≥25x25cm cross-section.
// Longitudinal reinforcement is cited as 4xΦ14mm in high-seismicity zones
// (ag >= 0.25g) vs 4xΦ12mm elsewhere — this project has no cited
// ag-by-locality table (see module doc comment above and CLAUDE.md), so it
// conservatively always uses the higher (4xΦ14) reinforcement: safe in
// every zone, merely over-conservative in a low-seismicity one. Stirrups
// Φ6mm at <=150mm spacing in the ordinary field (tighter spacing near
// longitudinal-bar overlaps and centură intersections is a per-drawing
// refinement this constructive default does not vary).
export const TIE_COLUMN_CROSS_SECTION_MM = 250
export const TIE_COLUMN_CONCRETE_CLASS = 'C12/15'
export const TIE_COLUMN_LONGITUDINAL_BAR_COUNT = 4
export const TIE_COLUMN_LONGITUDINAL_DIAMETER_MM = 14
export const TIE_COLUMN_STIRRUP_DIAMETER_MM = 6
export const TIE_COLUMN_STIRRUP_SPACING_MM = 150
// EN 1992-1-1 Table 4.4N, exposure class XC1 (dry/permanently-wet interior
// element) — the ordinary case for a tie-column embedded in an interior or
// rendered exterior wall, not directly weather-exposed.
export const TIE_COLUMN_COVER_MM = 25

export interface TieColumnReinforcementSpec {
  longitudinal: {
    barCount: number
    diameterMm: number
    coverMm: number
    /** Clear spacing between two adjacent corner bars along one cross-section edge. */
    edgeSpacingMm: number
  }
  stirrup: { diameterMm: number; spacingMm: number; coverMm: number }
}

export function deriveTieColumnReinforcement(): TieColumnReinforcementSpec {
  return {
    longitudinal: {
      barCount: TIE_COLUMN_LONGITUDINAL_BAR_COUNT,
      diameterMm: TIE_COLUMN_LONGITUDINAL_DIAMETER_MM,
      coverMm: TIE_COLUMN_COVER_MM,
      edgeSpacingMm:
        TIE_COLUMN_CROSS_SECTION_MM - 2 * TIE_COLUMN_COVER_MM - TIE_COLUMN_LONGITUDINAL_DIAMETER_MM,
    },
    stirrup: {
      diameterMm: TIE_COLUMN_STIRRUP_DIAMETER_MM,
      spacingMm: TIE_COLUMN_STIRRUP_SPACING_MM,
      coverMm: TIE_COLUMN_COVER_MM,
    },
  }
}

// Lintel (buiandrug) over every door/window opening — standard, effectively
// mandatory practice in Romanian masonry construction (confined or plain
// bearing masonry alike). A prefabricated unit (e.g. Porotherm A12 /
// equivalent Cemacon/Leier product lines) is the common default for an
// ordinary residential opening; a monolithic cast-in-place lintel is used
// for a non-standard span/load or to tie directly into the centură, which
// is a project-specific decision this module does not make.
//
// Bearing length: the Porotherm A12 manufacturer datasheet specifies a
// minimum 250mm bearing on full masonry units, each side. A separate
// secondary source cites a much larger (>400mm) figure, but that appears
// to describe non-structural infill masonry panels in RC-frame buildings,
// not a confined-masonry prefabricated lintel — this module uses the
// manufacturer-datasheet figure (250mm) as the more specific, reliable
// citation for this case; flagged for a structural engineer to confirm.
export const LINTEL_BEARING_LENGTH_MM = 250
export const LINTEL_PREFAB_PRODUCT_REF = 'Porotherm A12 (Wienerberger) — or equivalent prefab lintel product line'

export interface LintelSpec {
  /** Total length: the opening's width plus bearing on each side. */
  lengthMm: number
  /** Matches the wall thickness the opening sits in. */
  widthMm: number
  bearingLengthMm: number
  prefabricated: boolean
}

/**
 * Constructive-minimum lintel spec for one opening. Always prefabricated by
 * default (the cited common case) — a monolithic lintel is a project-
 * specific override this module doesn't decide (a caller picks it by
 * calling `deriveMonolithicLintelReinforcement` for the reinforcement
 * spec + `deriveMonolithicLintelHeightMm` for the beam depth, and setting
 * `prefabricated: false` on the resulting LintelSpec).
 */
export function deriveLintelSpec(openingWidthMm: number, wallThicknessMm: number): LintelSpec {
  return {
    lengthMm: openingWidthMm + 2 * LINTEL_BEARING_LENGTH_MM,
    widthMm: wallThicknessMm,
    bearingLengthMm: LINTEL_BEARING_LENGTH_MM,
    prefabricated: true,
  }
}

// ---------------------------------------------------------------------------
// Monolithic (cast-in-place) reinforced-concrete lintel — CR6-2013 + SR EN
// 1992-1-1 §9.2 minimums, cross-checked in secondary sources
// ---------------------------------------------------------------------------
//
// Rare in residential practice (a prefabricated lintel handles the ordinary
// door/window case — see `deriveLintelSpec`) but common when a lintel spans a
// non-standard opening or is cast monolithically with the floor's centură /
// slab (the "possibly tied to the centură" case documented in Encipedia's
// zidărie confinată notes). This helper covers only the constructive
// minimums a caller can safely default to; the load-derived reinforcement a
// specific span/load actually needs is a structural calculation this module
// does not perform (same disclaimer every other law-module carries).
//
// CITATION-CONFIDENCE NOTE: official CR6-2013 / SR EN 1992-1-1 PDF hosts
// (asro.ro, mdlpa.ro, encipedia.org/articole) systematically 403 in this
// project's environment (same block that hit every prior module — see
// CLAUDE.md). Values below come from two independently-phrased secondary-
// source searches converging on identical figures:
//   * Minimum longitudinal bar diameter Ø12 mm (top + bottom) — Encipedia's
//     CR2-1-1-1/2013 "Prevederi constructive" article ("minimum diameter
//     12mm for profiled steel") cross-checked in casasidesign.ro's
//     minimum-reinforcement-diameters guide (same Ø12 mm floor for a
//     bending element).
//   * 2 top + 2 bottom bars — Encipedia + colegiu-diriginti-santier.ro's
//     zidărie-confinată design guidance ("armare longitudinală de rezistență
//     în părțile superioară și inferioară ale secțiunii, cu 2 bare cu
//     diametru minim 12mm" per side).
//   * Concrete class C16/20 — Encipedia (recommended for buiandrug monolit)
//     cross-checked in colegiu-diriginti-santier.ro's zidărie-confinată
//     article ("beton armat clasa C 16/20"). Note this is one class UP from
//     the tie-column / centură C12/15 minimum — a lintel is a bending
//     element carrying wall loads over the opening, not a confining tie.
//   * Minimum depth ratio h ≥ L/5 — colegiu-diriginti-santier.ro's zidărie
//     guidance ("h > L/5") cross-checked in forum.misiuneacasa.ro's
//     buiandrugi-turnare thread (same ratio widely repeated as the "old
//     masonry standard" rule of thumb). This is a geometric minimum, not a
//     load-derived depth.
//   * Bearing length ≥ 400 mm on each side — colegiu-diriginti-santier.ro
//     ("lățimea de rezemare a buiandrugilor pe pereții de zidărie trebuie să
//     fie mai mare de 40 cm") cross-checked in the Wienerberger Porotherm
//     technical brief (which cites the same 40 cm figure for a MONOLITHIC
//     lintel while separately specifying 250 mm for its prefabricated A12
//     product — the two match, one per case).
//   * Stirrup Ø6 mm @ 150 mm — NOT independently cross-checked for
//     monolithic lintels specifically. The value is inherited from CR6-2013
//     confining-element practice (see TIE_COLUMN_STIRRUP_* / centura.ts —
//     same Ø6 @ 150 mm), which is the correct fallback here since a
//     monolithic lintel is often cast integral with the centură and shares
//     its stirrup detailing. Flagged for engineer confirmation; the load-
//     derived shear reinforcement per SR EN 1992-1-1 §9.2.2 is a structural
//     calculation this module does not perform.
// As with every other seeded structural default in this project, a
// structural engineer must confirm the exact CR6-2013 / SR EN 1992-1-1
// figures against an official copy before construction use.

export const MONOLITHIC_LINTEL_CONCRETE_CLASS = 'C16/20'
export const MONOLITHIC_LINTEL_LONGITUDINAL_DIAMETER_MM = 12
/** 2 top + 2 bottom bars: the standard-practice minimum for a shallow beam
 *  over an opening in confined masonry. */
export const MONOLITHIC_LINTEL_LONGITUDINAL_BAR_COUNT = 4
export const MONOLITHIC_LINTEL_STIRRUP_DIAMETER_MM = 6
export const MONOLITHIC_LINTEL_STIRRUP_SPACING_MM = 150
/** Nominal cover for an interior-embedded XC1 confining beam element —
 *  matches TIE_COLUMN_COVER_MM (both come from EN 1992-1-1 Table 4.4N XC1
 *  structural class S4, cmin,dur 15 mm + Δcdev 10 mm). */
export const MONOLITHIC_LINTEL_COVER_MM = 25
/** Geometric minimum depth ratio: h >= L/5 (old-standard "masonry" rule
 *  widely repeated in RO practice, not a load-derived depth). */
export const MONOLITHIC_LINTEL_MIN_DEPTH_RATIO = 1 / 5
/** Minimum bearing length each side (mm) — 40 cm per RO practice
 *  guidance for monolithic lintels, larger than the 25 cm prefabricated
 *  A12 datasheet bearing. */
export const MONOLITHIC_LINTEL_BEARING_LENGTH_MM = 400

export interface MonolithicLintelReinforcementSpec {
  longitudinal: {
    /** Same barCount arrangement as a tie-column's 4 fixed bars, but here
     *  divided as 2 top + 2 bottom (bending element) rather than 4 corners. */
    barCount: number
    diameterMm: number
    coverMm: number
  }
  stirrup: { diameterMm: number; spacingMm: number; coverMm: number }
  concreteClass: string
}

/**
 * Constructive-minimum reinforcement for a MONOLITHIC (cast-in-place)
 * reinforced-concrete lintel over an opening in a masonry wall. Deliberately
 * a floor — the load-derived bar diameter/count and shear-derived stirrup
 * spacing a specific span/load actually needs is a structural calculation
 * per SR EN 1992-1-1 §6/§9.2 that this module does not perform. Callers who
 * need the LintelSpec geometry alongside the reinforcement should call this
 * plus `deriveMonolithicLintelHeightMm` and set `prefabricated: false`.
 *
 * The two arguments (openingWidthM, wallThicknessMm) are accepted but not
 * currently branched on — every span in the constructive-minimum regime
 * gets the same 4×Ø12 + Ø6@150 arrangement. They are kept in the signature
 * so a future step can size the reinforcement up for a long/loaded span
 * without breaking callers.
 */
export function deriveMonolithicLintelReinforcement(
  _openingWidthM: number,
  _wallThicknessMm: number,
): MonolithicLintelReinforcementSpec {
  return {
    longitudinal: {
      barCount: MONOLITHIC_LINTEL_LONGITUDINAL_BAR_COUNT,
      diameterMm: MONOLITHIC_LINTEL_LONGITUDINAL_DIAMETER_MM,
      coverMm: MONOLITHIC_LINTEL_COVER_MM,
    },
    stirrup: {
      diameterMm: MONOLITHIC_LINTEL_STIRRUP_DIAMETER_MM,
      spacingMm: MONOLITHIC_LINTEL_STIRRUP_SPACING_MM,
      coverMm: MONOLITHIC_LINTEL_COVER_MM,
    },
    concreteClass: MONOLITHIC_LINTEL_CONCRETE_CLASS,
  }
}

/**
 * Minimum monolithic lintel depth (h in mm), per the widely-cited h >= L/5
 * old-standard masonry rule. Floored at 200 mm (a common practical minimum
 * that matches Encipedia's "for an opening of ~1.00m, this results in
 * h > 20cm" example). Load-derived depth is a structural calculation this
 * module does not perform.
 */
export function deriveMonolithicLintelHeightMm(openingWidthMm: number): number {
  return Math.max(200, Math.ceil(openingWidthMm * MONOLITHIC_LINTEL_MIN_DEPTH_RATIO))
}

/**
 * Full geometry spec for a monolithic lintel: same shape as `deriveLintelSpec`
 * but with the larger 400mm-each-side bearing length and `prefabricated:
 * false`. Reinforcement comes separately from
 * `deriveMonolithicLintelReinforcement`.
 */
export function deriveMonolithicLintelSpec(
  openingWidthMm: number,
  wallThicknessMm: number,
): LintelSpec {
  return {
    lengthMm: openingWidthMm + 2 * MONOLITHIC_LINTEL_BEARING_LENGTH_MM,
    widthMm: wallThicknessMm,
    bearingLengthMm: MONOLITHIC_LINTEL_BEARING_LENGTH_MM,
    prefabricated: false,
  }
}
