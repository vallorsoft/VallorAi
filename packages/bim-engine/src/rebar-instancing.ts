import { generateLongitudinalRebarLayout } from './rebar'
import type { WallPlacementMm } from './instancing'
import type { RebarBarSpec, RebarInstanceTransform } from './types'

// Longitudinal-rebar instance composition (BIM-detail step 8): turns the
// pure layout from rebar.ts into world-space transform matrices over a unit
// cylinder, mirroring how instancing.ts feeds bricks to an InstancedMesh.

export interface RebarInstancingResult {
  count: number
  /**
   * Column-major 4×4 transform matrices, 16 floats per instance, in METERS,
   * directly usable as a three.js InstancedMesh.instanceMatrix buffer over a
   * unit cylinder — CylinderGeometry(0.5, 0.5, 1), i.e. diameter 1, height 1,
   * axis along local Y. Each matrix rotates that axis onto the wall's
   * start→end direction and scales to the bar's diameter/length.
   */
  matrices: Float32Array
}

const MM_PER_M = 1000

/**
 * Compose world-space instance matrices for an already-generated longitudinal
 * rebar layout. The layout's element-local frame (X along the run, Z across
 * the element width, Y up from the element base — see rebar.ts) is placed
 * with the same convention the brick instancing uses: the element runs from
 * the wall's start to end point, the width spans the wall thickness centered
 * on that line, and `baseYMm` is the bottom elevation.
 */
export function composeRebarInstanceMatrices(
  placement: WallPlacementMm,
  layout: RebarInstanceTransform[],
): RebarInstancingResult {
  const dx = placement.endXMm - placement.startXMm
  const dz = placement.endZMm - placement.startZMm
  const lengthMm = Math.hypot(dx, dz)
  if (lengthMm === 0 || layout.length === 0) {
    return { count: 0, matrices: new Float32Array(0) }
  }

  // Unit direction along the wall, and the horizontal normal across its
  // thickness. {p, u, worldY} is right-handed (p × u = worldY).
  const ux = dx / lengthMm
  const uz = dz / lengthMm
  const px = -uz
  const pz = ux

  const matrices = new Float32Array(layout.length * 16)

  for (let i = 0; i < layout.length; i++) {
    const bar = layout[i]
    const dM = bar.diameterMm / MM_PER_M
    const lM = bar.lengthMm / MM_PER_M
    const acrossMm = bar.zMm - placement.thicknessMm / 2

    const tx = (placement.startXMm + ux * bar.xMm + px * acrossMm) / MM_PER_M
    const ty = (placement.baseYMm + bar.yMm) / MM_PER_M
    const tz = (placement.startZMm + uz * bar.xMm + pz * acrossMm) / MM_PER_M

    const o = i * 16
    // Column 0: local X (bar cross-section) → across-thickness normal × Ø.
    matrices[o] = px * dM
    matrices[o + 1] = 0
    matrices[o + 2] = pz * dM
    matrices[o + 3] = 0
    // Column 1: local Y (unit cylinder axis) → along-wall direction × length.
    matrices[o + 4] = ux * lM
    matrices[o + 5] = 0
    matrices[o + 6] = uz * lM
    matrices[o + 7] = 0
    // Column 2: local Z → world up × Ø.
    matrices[o + 8] = 0
    matrices[o + 9] = dM
    matrices[o + 10] = 0
    matrices[o + 11] = 0
    matrices[o + 12] = tx
    matrices[o + 13] = ty
    matrices[o + 14] = tz
    matrices[o + 15] = 1
  }

  return { count: layout.length, matrices }
}

/**
 * Convenience wrapper: longitudinal layout (see rebar.ts) + world-space
 * matrix composition for one wall-shaped element. LONGITUDINAL role only —
 * stirrups are bent closed loops and need their own geometry (step 9).
 */
export function generateWallLongitudinalRebarInstances(
  placement: WallPlacementMm,
  spec: RebarBarSpec,
): RebarInstancingResult {
  const dx = placement.endXMm - placement.startXMm
  const dz = placement.endZMm - placement.startZMm
  const lengthMm = Math.hypot(dx, dz)
  if (lengthMm === 0 || spec.role !== 'LONGITUDINAL') {
    return { count: 0, matrices: new Float32Array(0) }
  }
  const layout = generateLongitudinalRebarLayout(
    { lengthMm, widthMm: placement.thicknessMm },
    spec,
  )
  return composeRebarInstanceMatrices(placement, layout)
}
