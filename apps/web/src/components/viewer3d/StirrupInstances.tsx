'use client'

import { useLayoutEffect, useRef } from 'react'
import type { InstancedMesh } from 'three'
import type { StirrupPool } from './useStirrupInstances'

// Slightly lighter than the longitudinal-bar steel color so a mixed close-up
// (bars + stirrups in the same tie-column) stays legible — same SR 438-1
// blued-gray family, just brighter.
const STIRRUP_COLOR = '#5f6773'

/**
 * One InstancedMesh per floor pool: every stirrup segment is the same unit
 * cylinder — CylinderGeometry(0.5, 0.5, 1), axis along Y — scaled/rotated
 * into one of the 4 sides of a rectangular loop by its instance matrix
 * (see bim-engine stirrup-instancing.ts). Shadows stay off (matches the
 * longitudinal-bar mesh); low radial segment count because stirrup bars
 * are millimeters thick — per-bar silhouette detail is invisible at any
 * distance the LOD shows them from.
 */
export function StirrupInstances({ pool }: { pool: StirrupPool }) {
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
      <cylinderGeometry args={[0.5, 0.5, 1, 8]} />
      <meshLambertMaterial color={STIRRUP_COLOR} />
    </instancedMesh>
  )
}
