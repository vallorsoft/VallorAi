'use client'

import { useLayoutEffect, useRef } from 'react'
import type { InstancedMesh } from 'three'
import type { TieColumnPool } from './useTieColumnInstances'

/**
 * Structural concrete (C12/15 confining-element class, CR6-2013): a plain
 * mid-gray, matching what raw poured concrete reads as before finish. Kept
 * darker than the mortar tone used by the brick pool so a close-up mixed
 * view (bricks + column body + centura beam) stays legible.
 */
const CONCRETE_COLOR = '#8a8f96'

/**
 * One InstancedMesh per floor pool: every tie-column body is the same unit
 * box (BoxGeometry(1,1,1)) scaled to `crossSection × storeyHeight ×
 * crossSection` by its per-instance matrix (see useTieColumnInstances). No
 * shadows (matches every other viewer3d pool).
 */
export function TieColumnInstances({ pool }: { pool: TieColumnPool }) {
  const meshRef = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    ;(mesh.instanceMatrix.array as Float32Array).set(pool.matrices)
    mesh.instanceMatrix.needsUpdate = true
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
      <meshLambertMaterial color={CONCRETE_COLOR} />
    </instancedMesh>
  )
}
