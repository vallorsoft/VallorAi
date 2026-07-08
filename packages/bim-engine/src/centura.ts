// Romanian building-code law module #3: reinforced-concrete ring beams
// (centuri) per CR6-2013 — tie the confining tie-columns (stâlpișori,
// module 2) together horizontally at every floor level, so the walls at
// that level move as one unit under a seismic load instead of the
// individual wall panels racking independently. Pure, deterministic
// constructive-minimum rules — not a load-bearing structural design (see
// foundation.ts's same disclaimer).
//
// Citation confidence note: direct WebFetch to every official host tried
// for this module (mdlpa.ro, legislatie.just.ro, cnadnr.ro) returned
// HTTP 403 in this project's environment — a systematic block, not a
// per-source fluke. The numbers below are corroborated across multiple
// independent WebSearch-synthesized secondary sources converging on
// identical values (not a single unverified blog), but none could be
// checked against the primary CR6-2013 text directly. Treat as
// high-confidence secondary, not primary-verified — a structural engineer
// should confirm against a purchased/official copy of CR6-2013 before
// construction use, same as every other seeded structural default.

export interface CenturaWallSegment {
  id: string
  startX: number
  startY: number
  endX: number
  endY: number
  floor: number
  thicknessMm: number
  isLoadBearing: boolean
  isExterior: boolean
}

// STAS 10107/2-92 ("Plansee curente din plăci și grinzi din beton armat și
// precomprimat") cites 12-13cm as the typical minimum thickness for an
// ordinary residential monolithic floor slab. A centură's own height
// requirement scales with slab thickness (see deriveCenturaHeightMm), so
// this module uses the upper (130mm), more conservative end of that cited
// range — never under-sizes the centură relative to the standard's stated
// minimum. The load-specific slab thickness a real span/loading needs is a
// structural calculation this module does not perform.
export const DEFAULT_SLAB_THICKNESS_MM = 130

// CR6-2013: a centură's height is at least the floor slab thickness for an
// interior wall, and DOUBLE that for a perimeter (exterior) wall. Width
// matches the wall thickness, or 250mm if the centură is set back from the
// wall face for exterior thermal insulation (this module always uses the
// wall-thickness-matching width — the set-back case is a facade-detailing
// choice a user/architect makes later, not a constructive minimum).
export function deriveCenturaHeightMm(isExterior: boolean): number {
  return isExterior ? DEFAULT_SLAB_THICKNESS_MM * 2 : DEFAULT_SLAB_THICKNESS_MM
}

export function deriveCenturaWidthMm(wallThicknessMm: number): number {
  return wallThicknessMm
}

// CR6-2013 constructive minimums: longitudinal reinforcement ratio 0.5%
// (commonly realized as >=4xΦ10 for an ordinary confining-element cross-
// section), Φ6mm stirrups at <=150mm spacing. Concrete class and cover
// reuse the same confining-element minimums as the tie-columns (module 2):
// C12/15, 25mm cover (EN 1992-1-1 Table 4.4N, XC1).
export const CENTURA_CONCRETE_CLASS = 'C12/15'
export const CENTURA_COVER_MM = 25
export const CENTURA_LONGITUDINAL_RATIO = 0.005 // 0.5%
export const CENTURA_LONGITUDINAL_MIN_BAR_COUNT = 4
export const CENTURA_LONGITUDINAL_MIN_DIAMETER_MM = 10
export const CENTURA_STIRRUP_DIAMETER_MM = 6
export const CENTURA_STIRRUP_SPACING_MM = 150

export interface CenturaReinforcementSpec {
  longitudinal: {
    barCount: number
    diameterMm: number
    coverMm: number
    /** Clear horizontal spacing between the two side-by-side bars in one layer (top pair / bottom pair). */
    edgeSpacingMm: number
  }
  stirrup: { diameterMm: number; spacingMm: number; coverMm: number }
}

/**
 * Constructive-minimum centură reinforcement for a given cross-section.
 * Bar count is derived from the 0.5% ratio at the cited minimum Φ10
 * diameter, floored at 4 bars (2 top + 2 bottom, the ordinary confining-
 * element arrangement) — never fewer, occasionally more for a deep
 * (wide-perimeter) centură where 4xΦ10 alone would fall under 0.5%.
 */
export function deriveCenturaReinforcement(heightMm: number, widthMm: number): CenturaReinforcementSpec {
  const areaMm2 = heightMm * widthMm
  const barAreaMm2 = Math.PI * (CENTURA_LONGITUDINAL_MIN_DIAMETER_MM / 2) ** 2
  const requiredBarCount = Math.ceil((areaMm2 * CENTURA_LONGITUDINAL_RATIO) / barAreaMm2)
  const barCount = Math.max(CENTURA_LONGITUDINAL_MIN_BAR_COUNT, requiredBarCount)

  return {
    longitudinal: {
      barCount,
      diameterMm: CENTURA_LONGITUDINAL_MIN_DIAMETER_MM,
      coverMm: CENTURA_COVER_MM,
      edgeSpacingMm: widthMm - 2 * CENTURA_COVER_MM - CENTURA_LONGITUDINAL_MIN_DIAMETER_MM,
    },
    stirrup: {
      diameterMm: CENTURA_STIRRUP_DIAMETER_MM,
      spacingMm: CENTURA_STIRRUP_SPACING_MM,
      coverMm: CENTURA_COVER_MM,
    },
  }
}

export interface CenturaLevelPlacement {
  wallId: string
  /** Vertical level this centură belongs to: the wall's own floor, or (topmost floor + 1) for the above-last-level case. */
  level: number
  heightMm: number
  widthMm: number
}

/**
 * One centură per load-bearing wall at its own floor level, per CR6-2013's
 * "at all floor levels" requirement — PLUS a second centură (reusing the
 * top floor's wall footprints) one level above the topmost floor, for the
 * "level above the last residential level, for buildings with non-walkable
 * attics" case. This project has no walkable-vs-non-walkable-attic field
 * on House yet, so it conservatively always generates the extra level
 * (the safe default: an unneeded centură under a walkable/habitable attic
 * is merely extra, never a missing requirement).
 */
export function deriveCenturaLevels(walls: CenturaWallSegment[]): CenturaLevelPlacement[] {
  const bearing = walls.filter((w) => w.isLoadBearing)
  if (bearing.length === 0) return []

  const topFloor = Math.max(...bearing.map((w) => w.floor))
  const placements: CenturaLevelPlacement[] = []

  for (const wall of bearing) {
    const heightMm = deriveCenturaHeightMm(wall.isExterior)
    const widthMm = deriveCenturaWidthMm(wall.thicknessMm)
    placements.push({ wallId: wall.id, level: wall.floor, heightMm, widthMm })
    if (wall.floor === topFloor) {
      placements.push({ wallId: wall.id, level: topFloor + 1, heightMm, widthMm })
    }
  }

  return placements
}
