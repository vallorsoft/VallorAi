import type { RebarBarSpec } from './types'

// BIM-detail step 9: stirrup / kengyer / etriers — the bent closed-loop
// reinforcement that ties a confining element's longitudinal bars together
// and confines the concrete core. Geometrically distinct from a straight
// longitudinal bar (rebar.ts) — a stirrup is a rectangular loop in the
// plane perpendicular to the element's long axis, replicated at
// `spec.spacingMm` intervals along the length.
//
// This module is pure calc (no `three`), element-agnostic: caller (API +
// 3D viewer) maps its own tie-column / centură (CR6-2013 confining
// element) into `StirrupElementDimensions` and passes the STIRRUP-role
// `ReinforcementSpec` in as `spec`. The stirrup diameter/spacing/cover
// values already live in the DB (module 2 / 3) — this module never
// invents a structural default, matching Key rule 7.
//
// Constructive layout, not a load-bearing design: bar overlap length and
// the closer stirrup spacing that CR6-2013 requires near element ends
// (the "confined zone") are project-specific detailing decisions this
// module doesn't perform — see CLAUDE.md's Step 9 note.

const STEEL_DENSITY_KG_M3 = 7850

export interface StirrupElementDimensions {
  /** Element length along its long axis, mm. */
  lengthMm: number
  /**
   * Cross-section dimension along axis A (perpendicular to the long axis).
   * For a tie-column both A and B equal `crossSectionMm` (250×250mm). For
   * a centură A is the vertical height and B the horizontal width matching
   * the wall thickness.
   */
  crossSectionAMm: number
  /** Cross-section dimension along axis B (see crossSectionAMm). */
  crossSectionBMm: number
}

/**
 * One closed rectangular stirrup loop, in the element's own frame:
 * positioned at `positionMm` along the long axis (measured from the
 * element's start end), and reaching from `-halfAMm` to `+halfAMm` along
 * cross-section axis A and from `-halfBMm` to `+halfBMm` along axis B.
 * The halves are computed from cross-section, cover and bar diameter —
 * i.e. the stirrup's outer face sits at `coverMm` from the concrete face
 * and its centerline is `coverMm + diameterMm/2` inside.
 */
export interface StirrupLoop {
  positionMm: number
  halfAMm: number
  halfBMm: number
  diameterMm: number
}

/**
 * The number of stirrups along an element: the first sits at `coverMm`
 * from the near end, subsequent loops at `spacingMm` increments, and the
 * last one no further than `coverMm` from the far end. This matches the
 * ordinary residential detailing practice (a stirrup at each end plus
 * intervening spacing) — CR6-2013's tighter end-zone spacing is a
 * detailing refinement this constructive default does not vary (see
 * module doc comment).
 */
export function calculateStirrupCount(
  element: StirrupElementDimensions,
  spec: RebarBarSpec,
): number {
  const usable = element.lengthMm - 2 * spec.coverMm
  if (usable <= 0) return 0
  if (spec.spacingMm <= 0) return 1
  return Math.max(1, Math.floor(usable / spec.spacingMm) + 1)
}

export function generateStirrupLayout(
  element: StirrupElementDimensions,
  spec: RebarBarSpec,
): StirrupLoop[] {
  const halfAMm = element.crossSectionAMm / 2 - spec.coverMm - spec.diameterMm / 2
  const halfBMm = element.crossSectionBMm / 2 - spec.coverMm - spec.diameterMm / 2
  if (halfAMm <= 0 || halfBMm <= 0) return []
  const count = calculateStirrupCount(element, spec)
  if (count === 0) return []

  const loops: StirrupLoop[] = []
  for (let i = 0; i < count; i++) {
    loops.push({
      positionMm: spec.coverMm + i * spec.spacingMm,
      halfAMm,
      halfBMm,
      diameterMm: spec.diameterMm,
    })
  }
  return loops
}

export interface StirrupQuantity {
  loopCount: number
  /** Total unbent bar length required (mm) — perimeter × loop count, ignoring hook overlap. */
  totalLengthMm: number
  totalWeightKg: number
}

/**
 * Constructive quantity: perimeter of one loop × loop count. Hook overlap
 * length (the extra bar needed at the free ends to close the loop, per
 * SR EN 1992-1-1 §8.5) is not added — it's a real material item but the
 * amount is small and depends on hook geometry the module doesn't
 * generate; leave that to a future refinement rather than guess.
 */
export function calculateStirrupQuantity(
  element: StirrupElementDimensions,
  spec: RebarBarSpec,
): StirrupQuantity {
  const loops = generateStirrupLayout(element, spec)
  if (loops.length === 0) {
    return { loopCount: 0, totalLengthMm: 0, totalWeightKg: 0 }
  }
  const perimeterMm = loops.reduce((sum, l) => sum + 4 * (l.halfAMm + l.halfBMm), 0)
  const areaM2 = Math.PI * (spec.diameterMm / 2000) ** 2
  const weightPerMeterKg = areaM2 * STEEL_DENSITY_KG_M3
  return {
    loopCount: loops.length,
    totalLengthMm: perimeterMm,
    totalWeightKg: (perimeterMm / 1000) * weightPerMeterKg,
  }
}
