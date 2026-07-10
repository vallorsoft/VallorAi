'use client'

import { useLayoutEffect, useRef } from 'react'
import type { InstancedMesh } from 'three'
import type { CenturaPool } from './useCenturaInstances'

/**
 * Same concrete mid-gray as tie-columns — visually one material family, since
 * a centură is the horizontal counterpart of a tie-column in confined-masonry
 * detailing (CR6-2013).
 */
const CONCRETE_COLOR = '#8a8f96'

/**
 * One InstancedMesh per level pool: every centura beam is the same unit box
 * scaled to `length × height × width` and rotated along its host wall's
 * direction by the per-instance matrix (see useCenturaInstances).
 */
export function CenturaInstances({ pool }: { pool: CenturaPool }) {
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
