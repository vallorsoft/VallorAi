'use client'

import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Object3D } from 'three'

export type LODTier = 'detail' | 'medium' | 'far'

// Placeholder camera-distance thresholds (meters) for Step 6 (brick/rebar
// instancing) to swap in real geometry below LOD_NEAR_M and drop to a coarse
// box above LOD_MEDIUM_M. Not tuned against real frame-rate numbers yet —
// per the Phase 7 plan, Step 6 validates perf on a single wall first and
// should adjust these two constants then.
const LOD_NEAR_M = 8
const LOD_MEDIUM_M = 25

function tierForDistance(distance: number): LODTier {
  if (distance < LOD_NEAR_M) return 'detail'
  if (distance < LOD_MEDIUM_M) return 'medium'
  return 'far'
}

/** Camera-distance LOD scaffold: tracks which detail tier a scene object falls
 * into as the camera moves, so Step 6+ can swap geometry without re-deriving
 * this distance/threshold logic. No brick/rebar geometry exists yet, so
 * nothing consumes the tier for rendering decisions beyond the dev overlay. */
export function useLOD(targetRef: React.RefObject<Object3D>): LODTier {
  const [tier, setTier] = useState<LODTier>('far')
  const lastTier = useRef<LODTier>('far')

  useFrame(({ camera }) => {
    const target = targetRef.current
    if (!target) return
    const next = tierForDistance(camera.position.distanceTo(target.position))
    if (next !== lastTier.current) {
      lastTier.current = next
      setTier(next)
    }
  })

  return tier
}
