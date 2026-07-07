'use client'

import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3 } from 'three'

export type LODTier = 'detail' | 'medium' | 'far'

// Camera-distance thresholds (meters): below LOD_NEAR_M the viewer swaps in
// real per-brick geometry (BrickInstances), above LOD_MEDIUM_M everything is
// a coarse box. Validated in a real browser against the instanced masonry of
// a seeded 10×8m test house (~2.8k instances) — frame rate at 'detail' was
// indistinguishable from the box-only tiers, so the placeholder values stand.
const LOD_NEAR_M = 8
const LOD_MEDIUM_M = 25

function tierForDistance(distance: number): LODTier {
  if (distance < LOD_NEAR_M) return 'detail'
  if (distance < LOD_MEDIUM_M) return 'medium'
  return 'far'
}

/**
 * Camera-distance LOD: tracks which detail tier the scene content around
 * `worldCenter` falls into as the camera moves. HouseScene recenters the
 * house content on the world origin (its group position is the *offset*, not
 * the visual center), so the default center of [0, 0, 0] is the house center.
 */
export function useLOD(worldCenter: readonly [number, number, number] = [0, 0, 0]): LODTier {
  const [tier, setTier] = useState<LODTier>('far')
  const lastTier = useRef<LODTier>('far')
  const center = useMemo(() => new Vector3(...worldCenter), [worldCenter])

  useFrame(({ camera }) => {
    const next = tierForDistance(camera.position.distanceTo(center))
    if (next !== lastTier.current) {
      lastTier.current = next
      setTier(next)
    }
  })

  return tier
}
