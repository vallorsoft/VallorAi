'use client'

import { useMemo } from 'react'
import type { Wall } from '@/store/project.store'

const EXTERIOR_COLOR = '#94a3b8'
const INTERIOR_COLOR = '#e2e8f0'
// Masonry mortar tone — shows through the bed joints (12mm per NE 001/1996 /
// P2-85) between brick courses when the brick instances are overlaid.
const MORTAR_COLOR = '#b3aa99'

interface WallMeshProps {
  wall: Wall
  /**
   * When set (brick detail mode), the wall renders as a slightly-inset
   * mortar-colored core instead of the full abstract box: the brick instances
   * carry the visible faces, and this core fills the joint gaps between them.
   * Value = the brick block's through-thickness width in meters.
   */
  mortarCoreWidthM?: number
}

export function WallMesh({ wall, mortarCoreWidthM }: WallMeshProps) {
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

  if (mortarCoreWidthM !== undefined) {
    // Inset the core inside the brick envelope so only the joint gaps reveal
    // it — no z-fighting with the instanced brick faces.
    const coreThickness = Math.max(0.05, Math.min(wall.thickness, mortarCoreWidthM) - 0.02)
    return (
      <mesh position={[centerX, wall.height / 2, centerZ]} rotation={[0, rotationY, 0]}>
        <boxGeometry args={[Math.max(0.05, length - 0.01), wall.height - 0.005, coreThickness]} />
        <meshLambertMaterial color={MORTAR_COLOR} />
      </mesh>
    )
  }

  return (
    <mesh position={[centerX, wall.height / 2, centerZ]} rotation={[0, rotationY, 0]}>
      <boxGeometry args={[length, wall.height, wall.thickness]} />
      <meshStandardMaterial color={wall.isExterior ? EXTERIOR_COLOR : INTERIOR_COLOR} />
    </mesh>
  )
}
