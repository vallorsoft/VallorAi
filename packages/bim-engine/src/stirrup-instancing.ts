import { generateStirrupLayout, type StirrupLoop } from './stirrup'
import type { WallPlacementMm } from './instancing'
import type { RebarBarSpec } from './types'

// Stirrup instance composition (BIM-detail step 9): turns the pure loop
// layout from stirrup.ts into world-space transform matrices over the same
// unit cylinder the longitudinal-bar instancing uses. A stirrup is drawn
// as 4 straight bar segments (the 4 sides of the rectangular loop) rather
// than one bent torus/curve — same base geometry as rebar-instancing.ts,
// keeps the instance count bounded and the pipeline simple. Corner
// bend/hook geometry is a per-bar detailing refinement this module does
// not perform (see CLAUDE.md Step 9 note).

export interface StirrupInstancingResult {
  /** Total unit-cylinder instance count — 4 × stirrup loops. */
  count: number
  /**
   * Column-major 4×4 transform matrices, 16 floats per instance, in METERS,
   * directly usable as an InstancedMesh.instanceMatrix buffer over a unit
   * cylinder — CylinderGeometry(0.5, 0.5, 1), axis along local Y. Each
   * matrix rotates that axis onto one side of the loop and scales to the
   * bar's diameter/length.
   */
  matrices: Float32Array
}

/**
 * Element frame in world coordinates, in millimeters. `origin*` marks the
 * center of the element's start face — position 0 along the long axis, mid
 * of the cross-section. `longAxis`/`crossAxisA`/`crossAxisB` are three
 * mutually orthogonal unit vectors: long axis along the element's length,
 * A and B along the cross-section (A × B = long axis is not required — the
 * frame just needs to be orthonormal so the perpendicular radial vectors
 * used to fatten each bar are meaningful).
 */
export interface StirrupElementFrame {
  originXMm: number
  originYMm: number
  originZMm: number
  longAxis: { x: number; y: number; z: number }
  crossAxisA: { x: number; y: number; z: number }
  crossAxisB: { x: number; y: number; z: number }
}

const MM_PER_M = 1000
const SEGMENTS_PER_LOOP = 4

export function composeStirrupInstanceMatrices(
  frame: StirrupElementFrame,
  loops: StirrupLoop[],
): StirrupInstancingResult {
  if (loops.length === 0) return { count: 0, matrices: new Float32Array(0) }

  const total = loops.length * SEGMENTS_PER_LOOP
  const matrices = new Float32Array(total * 16)
  const { originXMm, originYMm, originZMm, longAxis: L, crossAxisA: A, crossAxisB: B } = frame

  for (let i = 0; i < loops.length; i++) {
    const loop = loops[i]
    // Center of this loop in world coordinates (mm).
    const cx = originXMm + L.x * loop.positionMm
    const cy = originYMm + L.y * loop.positionMm
    const cz = originZMm + L.z * loop.positionMm

    const halfA = loop.halfAMm
    const halfB = loop.halfBMm
    const dM = loop.diameterMm / MM_PER_M

    // The 4 sides of the loop, drawn edge-to-edge (no hook overlap — see
    // module doc comment): two along A at ±halfB, two along B at ±halfA.
    const lenAM = (2 * halfA) / MM_PER_M
    const lenBM = (2 * halfB) / MM_PER_M
    const segments: Array<{ offsetA: number; offsetB: number; axis: 'A' | 'B'; lengthM: number }> = [
      { offsetA: 0, offsetB: -halfB, axis: 'A', lengthM: lenAM },
      { offsetA: 0, offsetB: halfB, axis: 'A', lengthM: lenAM },
      { offsetA: -halfA, offsetB: 0, axis: 'B', lengthM: lenBM },
      { offsetA: halfA, offsetB: 0, axis: 'B', lengthM: lenBM },
    ]

    for (let s = 0; s < SEGMENTS_PER_LOOP; s++) {
      const seg = segments[s]
      // Segment midpoint in world coordinates (mm → m).
      const mx = (cx + A.x * seg.offsetA + B.x * seg.offsetB) / MM_PER_M
      const my = (cy + A.y * seg.offsetA + B.y * seg.offsetB) / MM_PER_M
      const mz = (cz + A.z * seg.offsetA + B.z * seg.offsetB) / MM_PER_M

      // Segment axis is A or B; the two perpendicular radial vectors used
      // to fatten the cylinder into a Ø-thick bar are the other cross axis
      // and the long axis (all three are mutually orthogonal in the frame).
      const axis = seg.axis === 'A' ? A : B
      const radial1 = seg.axis === 'A' ? B : A
      const radial2 = L

      const o = (i * SEGMENTS_PER_LOOP + s) * 16
      // Column 0: local X → radial1 × Ø.
      matrices[o + 0] = radial1.x * dM
      matrices[o + 1] = radial1.y * dM
      matrices[o + 2] = radial1.z * dM
      matrices[o + 3] = 0
      // Column 1: local Y (unit cylinder axis) → segment axis × length.
      matrices[o + 4] = axis.x * seg.lengthM
      matrices[o + 5] = axis.y * seg.lengthM
      matrices[o + 6] = axis.z * seg.lengthM
      matrices[o + 7] = 0
      // Column 2: local Z → radial2 × Ø.
      matrices[o + 8] = radial2.x * dM
      matrices[o + 9] = radial2.y * dM
      matrices[o + 10] = radial2.z * dM
      matrices[o + 11] = 0
      // Translation.
      matrices[o + 12] = mx
      matrices[o + 13] = my
      matrices[o + 14] = mz
      matrices[o + 15] = 1
    }
  }

  return { count: total, matrices }
}

/**
 * Vertical confining element (tie-column) frame convention: the column
 * stands at plan position (posXMm, posZMm) with its base at floor-local
 * elevation `baseYMm`, long axis pointing straight up. Cross-section
 * dimensions are the two horizontal extents of the concrete face —
 * `crossSectionAMm` along +X (plan), `crossSectionBMm` along +Z (plan).
 */
export interface TieColumnPlacementMm {
  posXMm: number
  posZMm: number
  baseYMm: number
  lengthMm: number
  crossSectionAMm: number
  crossSectionBMm: number
}

/**
 * Convenience wrapper: layout + world-space matrix composition for one
 * tie-column. STIRRUP role only — passing a longitudinal spec returns an
 * empty result so callers can iterate all reinforcement specs blindly
 * (mirrors `generateWallLongitudinalRebarInstances`).
 */
export function generateTieColumnStirrupInstances(
  placement: TieColumnPlacementMm,
  spec: RebarBarSpec,
): StirrupInstancingResult {
  if (spec.role !== 'STIRRUP') return { count: 0, matrices: new Float32Array(0) }
  const loops = generateStirrupLayout(
    {
      lengthMm: placement.lengthMm,
      crossSectionAMm: placement.crossSectionAMm,
      crossSectionBMm: placement.crossSectionBMm,
    },
    spec,
  )
  const frame: StirrupElementFrame = {
    originXMm: placement.posXMm,
    originYMm: placement.baseYMm,
    originZMm: placement.posZMm,
    longAxis: { x: 0, y: 1, z: 0 },
    crossAxisA: { x: 1, y: 0, z: 0 },
    crossAxisB: { x: 0, y: 0, z: 1 },
  }
  return composeStirrupInstanceMatrices(frame, loops)
}

/**
 * Horizontal confining element (centură) frame convention: the ring beam
 * runs along its host wall, from `(startXMm, startZMm)` to
 * `(endXMm, endZMm)` in plan, with its base at floor-local elevation
 * `baseYMm`. Cross-section: `crossSectionHeightMm` vertical, `widthMm`
 * horizontal across the wall (= wall thickness). The centura is centered
 * on the wall's midline both vertically (across height, from baseYMm to
 * baseYMm + heightMm) and horizontally (across thickness).
 */
export interface CenturaPlacementMm extends WallPlacementMm {
  crossSectionHeightMm: number
}

export function generateCenturaStirrupInstances(
  placement: CenturaPlacementMm,
  spec: RebarBarSpec,
): StirrupInstancingResult {
  if (spec.role !== 'STIRRUP') return { count: 0, matrices: new Float32Array(0) }
  const dx = placement.endXMm - placement.startXMm
  const dz = placement.endZMm - placement.startZMm
  const lengthMm = Math.hypot(dx, dz)
  if (lengthMm === 0) return { count: 0, matrices: new Float32Array(0) }

  const loops = generateStirrupLayout(
    {
      lengthMm,
      crossSectionAMm: placement.crossSectionHeightMm,
      crossSectionBMm: placement.thicknessMm,
    },
    spec,
  )
  // Unit direction along the wall in the horizontal plane, and the
  // horizontal perpendicular (across-thickness) — same handedness as
  // rebar-instancing.ts's `p = (-uz, ux)`.
  const ux = dx / lengthMm
  const uz = dz / lengthMm
  const px = -uz
  const pz = ux

  const frame: StirrupElementFrame = {
    // Origin at wall start point, mid-height of the centura, mid-thickness.
    originXMm: placement.startXMm,
    originYMm: placement.baseYMm + placement.crossSectionHeightMm / 2,
    originZMm: placement.startZMm,
    longAxis: { x: ux, y: 0, z: uz },
    // Axis A: vertical (matches crossSectionAMm = crossSectionHeightMm).
    crossAxisA: { x: 0, y: 1, z: 0 },
    // Axis B: horizontal across the wall (matches crossSectionBMm = thicknessMm).
    crossAxisB: { x: px, y: 0, z: pz },
  }
  return composeStirrupInstanceMatrices(frame, loops)
}
