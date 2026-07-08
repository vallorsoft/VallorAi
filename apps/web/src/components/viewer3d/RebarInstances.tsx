'use client'

import { useLayoutEffect, useRef } from 'react'
import type { InstancedMesh } from 'three'
import type { RebarPool } from './useRebarInstances'

// Unfinished reinforcement steel (SR 438-1 OB37/PC52/B500C bars) — a dark,
// slightly blued gray, clearly distinct from both masonry and mortar tones.
const STEEL_COLOR = '#4d5560'

/**
 * One InstancedMesh per floor pool: every longitudinal bar is the same unit
 * cylinder — CylinderGeometry(0.5, 0.5, 1), axis along Y — scaled/rotated
 * into place by its instance matrix (see bim-engine rebar-instancing.ts).
 * Shadows stay off like the bricks; low radial segment count because bars
 * are centimeters thick — per-bar silhouette detail is invisible at any
 * distance the LOD shows them from.
 */
export function RebarInstances({ pool }: { pool: RebarPool }) {
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
      <cylinderGeometry args={[0.5, 0.5, 1, 10]} />
      <meshLambertMaterial color={STEEL_COLOR} />
    </instancedMesh>
  )
}
