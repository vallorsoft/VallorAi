'use client'

import { useMemo } from 'react'
import type { Wall } from '@/store/project.store'

const EXTERIOR_COLOR = '#94a3b8'
const INTERIOR_COLOR = '#e2e8f0'

export function WallMesh({ wall }: { wall: Wall }) {
  const { centerX, centerZ, rotationY, length } = useMemo(() => {
    const dx = wall.endX - wall.startX
    const dz = wall.endY - wall.startY
    return {
      centerX: (wall.startX + wall.endX) / 2,
      centerZ: (wall.startY + wall.endY) / 2,
      rotationY: -Math.atan2(dz, dx),
      length: Math.hypot(dx, dz),
    }
  }, [wall])

  if (length === 0) return null

  return (
    <mesh position={[centerX, wall.height / 2, centerZ]} rotation={[0, rotationY, 0]}>
      <boxGeometry args={[length, wall.height, wall.thickness]} />
      <meshStandardMaterial color={wall.isExterior ? EXTERIOR_COLOR : INTERIOR_COLOR} />
    </mesh>
  )
}
