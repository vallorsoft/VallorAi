'use client'

import { useLayoutEffect, useRef } from 'react'
import { Color, InstancedBufferAttribute, type InstancedMesh } from 'three'
import type { BrickPool } from './useBrickInstances'

// Fired-clay tones per masonry category; cut (partial) bricks get a darker
// shade of the same tone so running-bond half bricks read at a glance.
const CATEGORY_COLORS: Record<string, string> = {
  BLOCK: '#c2703f',
  BRICK: '#9c4a32',
}
const DEFAULT_COLOR = '#a97246'
const CUT_SHADE = 0.78

/**
 * One InstancedMesh per (material × floor) pool — a single draw call for all
 * bricks sharing that material on that floor. Real-time shadows stay disabled
 * on the instances by design: with thousands of bricks the shadow pass is the
 * actual GPU cost, and the coarse wall box can carry any future shadow
 * instead (CLAUDE.md BIM-detail step 6).
 */
export function BrickInstances({ pool }: { pool: BrickPool }) {
  const meshRef = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    ;(mesh.instanceMatrix.array as Float32Array).set(pool.matrices)
    mesh.instanceMatrix.needsUpdate = true

    const whole = new Color(CATEGORY_COLORS[pool.materialCategory] ?? DEFAULT_COLOR)
    const cut = whole.clone().multiplyScalar(CUT_SHADE)
    const colors = new Float32Array(pool.count * 3)
    for (let i = 0; i < pool.count; i++) {
      const color = pool.cutFlags[i] === 1 ? cut : whole
      colors[i * 3] = color.r
      colors[i * 3 + 1] = color.g
      colors[i * 3 + 2] = color.b
    }
    mesh.instanceColor = new InstancedBufferAttribute(colors, 3)
    mesh.instanceColor.needsUpdate = true

    mesh.computeBoundingSphere()
  }, [pool])

  if (pool.count === 0) return null

  return (
    <instancedMesh
      key={`${pool.key}:${pool.count}`}
      ref={meshRef}
      args={[undefined, undefined, pool.count]}
      castShadow={false}
      receiveShadow={false}
    >
      <boxGeometry args={[1, 1, 1]} />
      {/* Lambert, not standard/PBR: with bricks filling the screen at detail
          tier, per-pixel shading cost dominates the frame budget, and matte
          fired clay gains nothing from a PBR response. */}
      <meshLambertMaterial color="#ffffff" />
    </instancedMesh>
  )
}
