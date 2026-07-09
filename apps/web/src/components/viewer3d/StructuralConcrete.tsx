'use client'

import { useLayoutEffect, useRef } from 'react'
import type { InstancedMesh } from 'three'
import type { ConcretePool } from './useStructuralInstances'

// Fresh confining-element concrete (C12/15 stâlpișori/centuri) — a cool
// cement gray, rendered translucent so the rebar cage inside reads (same
// convention as WallMesh's reinforcement-view translucency).
const CONCRETE_COLOR = '#9aa0a6'

/**
 * One InstancedMesh per floor pool of unit boxes — tie-column shafts and
 * centură prisms scaled/rotated into place by their instance matrices (see
 * bim-engine structural-rebar.ts composeWorldBoxMatrices).
 */
export function StructuralConcrete({ pool }: { pool: ConcretePool }) {
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
      <meshLambertMaterial color={CONCRETE_COLOR} transparent opacity={0.4} depthWrite={false} />
    </instancedMesh>
  )
}
