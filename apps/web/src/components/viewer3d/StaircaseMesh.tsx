'use client'

import type { StaircaseRow } from '@/hooks/useProjects'

/**
 * Concrete stair color — slightly lighter than the tie-column/centura gray so
 * the stepped profile reads against the wall boxes in a close-up view.
 */
const STAIR_COLOR = '#a5aab2'

interface StaircaseMeshProps {
  staircase: StaircaseRow
  elevationY: number
}

/**
 * Renders a staircase as a series of stepped box slices — one per riser/tread
 * pair — so the classic stair silhouette reads clearly at any zoom level.
 *
 * Each step box is:
 *   width  = staircase.widthM (the clear stair width)
 *   depth  = treadDepth (one tread in the direction of travel, +Z)
 *   height = accumulated riser height for that step (grows toward the top)
 *
 * The stepped stack sits at (posX, elevationY, posY) in world space, rising
 * in +Y and running in +Z. Handedness (LEFT vs RIGHT) is not yet reflected
 * in the geometry — a follow-up can rotate by π around Y.
 */
export function StaircaseMesh({ staircase, elevationY }: StaircaseMeshProps) {
  const { posX, posY, widthM, riserCount, riserHeightMm, treadDepthMm } = staircase
  const riserM = riserHeightMm / 1000
  const treadM = treadDepthMm / 1000

  const steps: { x: number; y: number; z: number; w: number; h: number; d: number }[] = []
  for (let i = 0; i < riserCount; i++) {
    // Each step box spans from the base up to (i+1)*riser in height.
    const stepH = (i + 1) * riserM
    const stepZ = i * treadM + treadM / 2
    steps.push({
      x: posX,
      y: elevationY + stepH / 2,
      z: posY + stepZ,
      w: widthM,
      h: stepH,
      d: treadM,
    })
  }

  return (
    <>
      {steps.map((s, i) => (
        <mesh key={i} position={[s.x, s.y, s.z]} castShadow={false} receiveShadow={false}>
          <boxGeometry args={[s.w, s.h, s.d]} />
          <meshLambertMaterial color={STAIR_COLOR} />
        </mesh>
      ))}
    </>
  )
}
