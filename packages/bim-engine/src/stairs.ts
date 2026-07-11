// Romanian building-code staircase module. Pure, deterministic spec derivation —
// not a load-bearing structural design. Every constant traces to a cited real
// standard or widely-published ergonomic rule (see comments per constant), per
// CLAUDE.md Key rule 7 — nothing here is invented.
//
// CITATION-CONFIDENCE NOTE: STAS 2965-86 "Scări în construcții civile" and NP
// 057-2002 §5.6's full step-geometry tables systematically 403 in this project's
// environment (same block that hit every prior law-module research pass). The
// constants below are secondary-corroborated — two independently-phrased searches
// converging on identical values — and are widely published in Romanian technical
// press and architectural textbooks. A structural engineer should confirm against
// a purchased/official copy before construction use.

/**
 * Classical Blondel ergonomic formula for stair comfort:
 *   2 × riserHeight + treadDepth ≈ 630 mm
 * Published by François Blondel (Cours d'architecture, 1675) and adopted as
 * the widely-cited residential comfort target in Romanian technical literature
 * and NP 057-2002 commentary. Not a hard normative limit — a design target.
 * Secondary sources: multiple RO architectural textbooks + casasidesign.ro.
 */
export const BLONDEL_TARGET_MM = 630

/**
 * Maximum riser height for residential stairs — NP 057-2002 §5.6 ("Normativ
 * privind proiectarea clădirilor de locuinţe", MLPTL Order 1383/24.09.2002).
 * Secondary-corroborated: encipedia.ro's NP 057-2002 summary + multiple RO
 * residential design guides converging on 200 mm as the max residential riser.
 */
export const MAX_RISER_MM = 200

/**
 * Minimum tread depth for residential stairs — NP 057-2002 §5.6.
 * Secondary-corroborated: same sources as MAX_RISER_MM; 250 mm is the
 * consistently cited minimum for a "going" (horizontal tread clear depth).
 */
export const MIN_TREAD_MM = 250

/**
 * Minimum clear width for a residential staircase — STAS 2965-86 §3.1 /
 * NP 057-2002 §5.6. Secondary-corroborated: encipedia.ro + multiple RO
 * residential design references cite 900 mm as the minimum clear width for a
 * straight residential flight allowing two people to pass each other.
 */
export const MIN_CLEAR_WIDTH_MM = 900

/**
 * Minimum headroom above any tread — NP 057-2002 §5.6 / STAS 2965-86.
 * Secondary-corroborated: 2000 mm is the universally cited RO residential
 * headroom minimum (measured vertically from the nosing line to any overhead
 * obstruction). Not enforced by this module (the obstruction height depends on
 * the floor slab geometry, which belongs to a separate structural module) —
 * exported for downstream consumers.
 */
export const MIN_HEADROOM_MM = 2000

export interface StaircaseParams {
  /** Floor-to-floor height in mm — typically 2700 mm (LEVEL_HEIGHT_M × 1000). */
  floorHeightMm: number
  /** Desired clear width in mm — clamped to MIN_CLEAR_WIDTH_MM if smaller. */
  widthMm?: number
}

export interface StaircaseSpec {
  /** Number of risers in a single straight flight. */
  riserCount: number
  /** Height of each riser in mm (= floorHeightMm / riserCount). */
  riserHeightMm: number
  /** Horizontal depth of each tread in mm (= BLONDEL_TARGET_MM − 2 × riserHeightMm). */
  treadDepthMm: number
  /** Total horizontal run of the flight in mm (= riserCount × treadDepthMm). */
  horizontalRunMm: number
  /** Actual clear width used — max(widthMm, MIN_CLEAR_WIDTH_MM). */
  widthMm: number
  /**
   * Blondel check value: 2R + T. Equals BLONDEL_TARGET_MM (630 mm) by
   * construction — exposed for the UI panel's compliance badge.
   */
  blondelMm: number
  /** True when all code thresholds are met (riser ≤ MAX_RISER_MM, tread ≥ MIN_TREAD_MM,
   *  width ≥ MIN_CLEAR_WIDTH_MM). */
  meetsCode: boolean
  /** Human-readable violation messages (in Romanian) for any failed check. */
  violations: string[]
}

/**
 * Derives the constructive-minimum staircase geometry for a given floor height.
 *
 * Algorithm (Blondel + NP 057-2002):
 *   1. Riser count = ceil(floorHeightMm / MAX_RISER_MM) — the fewest risers
 *      whose individual height stays at or below the code maximum (200 mm).
 *   2. Riser height = floorHeightMm / riserCount — exact equal division so
 *      the flight sum matches the floor-to-floor height precisely.
 *   3. Tread depth = BLONDEL_TARGET_MM − 2 × riserHeightMm — places the
 *      design on the Blondel line, the traditional comfort optimum.
 *   4. Horizontal run = riserCount × treadDepthMm (plan footprint length).
 *   5. Width = max(widthMm, MIN_CLEAR_WIDTH_MM).
 *
 * Note: when the riser derived by step 2 exceeds (BLONDEL_TARGET_MM −
 * MIN_TREAD_MM) / 2 = 190 mm, the resulting tread falls below MIN_TREAD_MM
 * and a code violation is recorded. This occurs when the floor height divided
 * by ceil(H/200) lands in the (190, 200] mm range — the UI should surface the
 * violation and prompt an architectural intervention (landing, winder steps).
 */
export function deriveStaircaseSpec(params: StaircaseParams): StaircaseSpec {
  const { floorHeightMm, widthMm = MIN_CLEAR_WIDTH_MM } = params

  // Minimum riser count so no single riser exceeds MAX_RISER_MM (NP 057-2002).
  const riserCount = Math.ceil(floorHeightMm / MAX_RISER_MM)
  // Exact equal-height risers summing to the floor-to-floor height.
  const riserHeightMm = floorHeightMm / riserCount
  // Blondel formula: tread = BLONDEL_TARGET − 2 × riser.
  const treadDepthMm = BLONDEL_TARGET_MM - 2 * riserHeightMm
  const horizontalRunMm = riserCount * treadDepthMm
  const effectiveWidth = Math.max(widthMm, MIN_CLEAR_WIDTH_MM)
  // Always 630 by construction (identity from the Blondel formula).
  const blondelMm = 2 * riserHeightMm + treadDepthMm

  const violations: string[] = []
  if (riserHeightMm > MAX_RISER_MM) {
    violations.push(
      `Contratreptă ${riserHeightMm.toFixed(1)}mm > ${MAX_RISER_MM}mm max (NP 057-2002)`,
    )
  }
  if (treadDepthMm < MIN_TREAD_MM) {
    violations.push(
      `Treaptă ${treadDepthMm.toFixed(1)}mm < ${MIN_TREAD_MM}mm min (NP 057-2002)`,
    )
  }
  if (effectiveWidth < MIN_CLEAR_WIDTH_MM) {
    violations.push(
      `Lățime ${effectiveWidth}mm < ${MIN_CLEAR_WIDTH_MM}mm min (STAS 2965-86)`,
    )
  }

  return {
    riserCount,
    riserHeightMm,
    treadDepthMm,
    horizontalRunMm,
    widthMm: effectiveWidth,
    blondelMm,
    meetsCode: violations.length === 0,
    violations,
  }
}
