import { generateBrickLayout } from './masonry'
import type { BrickInstanceTransform, BrickModule, WallOpeningMm } from './types'

/**
 * Where a wall sits in the scene, in millimeters, using the 3D viewer's axis
 * convention: the 2D plan's X/Y map to scene X/Z, Y is up. `baseYMm` is the
 * elevation of the wall's bottom edge (0 for a ground-floor wall).
 */
export interface WallPlacementMm {
  startXMm: number
  startZMm: number
  endXMm: number
  endZMm: number
  baseYMm: number
  heightMm: number
  thicknessMm: number
}

export interface BrickInstancingResult {
  count: number
  /**
   * Column-major 4×4 transform matrices, 16 floats per instance, directly
   * usable as a three.js InstancedMesh.instanceMatrix buffer over a unit box
   * geometry. Translations and scales are in METERS (three.js scene units),
   * converted from the mm inputs.
   */
  matrices: Float32Array
  /** 1 where the instance is a cut (partial) brick, 0 for a whole module. */
  cutFlags: Uint8Array
}

const MM_PER_M = 1000

/**
 * Compose world-space instance matrices for an already-generated brick layout.
 * Each matrix is translation × rotation-about-Y × scale, where the scale is
 * the brick's own dimensions (so the instanced geometry is a 1×1×1 box) and
 * the rotation aligns the brick's length axis with the wall's start→end
 * direction — the same convention the viewer's WallMesh uses
 * (`rotationY = -atan2(dz, dx)`).
 */
export function composeBrickInstanceMatrices(
  placement: WallPlacementMm,
  layout: BrickInstanceTransform[],
): BrickInstancingResult {
  const dx = placement.endXMm - placement.startXMm
  const dz = placement.endZMm - placement.startZMm
  const lengthMm = Math.hypot(dx, dz)
  if (lengthMm === 0 || layout.length === 0) {
    return { count: 0, matrices: new Float32Array(0), cutFlags: new Uint8Array(0) }
  }

  // Unit direction along the wall; for rotationY = -atan2(dz, dx):
  // cos(rotationY) = ux, sin(rotationY) = -uz.
  const ux = dx / lengthMm
  const uz = dz / lengthMm
  const cos = ux
  const sin = -uz

  const matrices = new Float32Array(layout.length * 16)
  const cutFlags = new Uint8Array(layout.length)

  for (let i = 0; i < layout.length; i++) {
    const brick = layout[i]
    const sx = brick.lengthMm / MM_PER_M
    const sy = brick.heightMm / MM_PER_M
    const sz = brick.widthMm / MM_PER_M
    const tx = (placement.startXMm + ux * brick.xMm) / MM_PER_M
    const ty = (placement.baseYMm + brick.yMm) / MM_PER_M
    const tz = (placement.startZMm + uz * brick.xMm) / MM_PER_M

    const o = i * 16
    matrices[o] = cos * sx
    matrices[o + 1] = 0
    matrices[o + 2] = -sin * sx
    matrices[o + 3] = 0
    matrices[o + 4] = 0
    matrices[o + 5] = sy
    matrices[o + 6] = 0
    matrices[o + 7] = 0
    matrices[o + 8] = sin * sz
    matrices[o + 9] = 0
    matrices[o + 10] = cos * sz
    matrices[o + 11] = 0
    matrices[o + 12] = tx
    matrices[o + 13] = ty
    matrices[o + 14] = tz
    matrices[o + 15] = 1
    cutFlags[i] = brick.isCut ? 1 : 0
  }

  return { count: layout.length, matrices, cutFlags }
}

/**
 * Convenience wrapper: running-bond layout (see masonry.ts) + world-space
 * matrix composition for a single wall, with door/window openings subtracted
 * and jamb/sill/lintel pieces cut to fit (opening-aware coursing, step 7).
 */
export function generateWallBrickInstances(
  placement: WallPlacementMm,
  brick: BrickModule,
  openings: WallOpeningMm[] = [],
): BrickInstancingResult {
  const dx = placement.endXMm - placement.startXMm
  const dz = placement.endZMm - placement.startZMm
  const lengthMm = Math.hypot(dx, dz)
  if (lengthMm === 0) {
    return { count: 0, matrices: new Float32Array(0), cutFlags: new Uint8Array(0) }
  }
  const layout = generateBrickLayout(
    { lengthMm, heightMm: placement.heightMm, thicknessMm: placement.thicknessMm },
    brick,
    openings,
  )
  return composeBrickInstanceMatrices(placement, layout)
}
