'use client'

import { useMemo, useRef } from 'react'
import { Html } from '@react-three/drei'
import type { Group } from 'three'
import type { House } from '@/store/project.store'
import { useTranslation } from '@/lib/useTranslation'
import { WallMesh } from './WallMesh'
import { RoomFloor } from './RoomFloor'
import { useLOD } from './useLOD'

function houseBounds(house: House) {
  const xs: number[] = []
  const zs: number[] = []
  house.walls.forEach((wall) => {
    xs.push(wall.startX, wall.endX)
    zs.push(wall.startY, wall.endY)
  })
  house.rooms.forEach((room) => {
    const x0 = room.posX ?? 0
    const y0 = room.posY ?? 0
    const depth = room.area / room.width
    if (Number.isFinite(depth)) {
      xs.push(x0, x0 + room.width)
      zs.push(y0, y0 + depth)
    }
  })
  if (xs.length === 0) return { centerX: 0, centerZ: 0 }
  return {
    centerX: (Math.min(...xs) + Math.max(...xs)) / 2,
    centerZ: (Math.min(...zs) + Math.max(...zs)) / 2,
  }
}

export function HouseScene({ house }: { house: House }) {
  const { t } = useTranslation()
  const groupRef = useRef<Group>(null)
  const { centerX, centerZ } = useMemo(() => houseBounds(house), [house])
  const lodTier = useLOD(groupRef)

  return (
    <group ref={groupRef} position={[-centerX, 0, -centerZ]}>
      {house.rooms.map((room) => (
        <RoomFloor key={room.id} room={room} />
      ))}
      {house.walls.map((wall) => (
        <WallMesh key={wall.id} wall={wall} />
      ))}
      <Html fullscreen>
        <div className="absolute top-3 right-3 rounded-md bg-white/90 px-2.5 py-1 text-xs text-gray-500 shadow-sm pointer-events-none">
          {t.editor.viewer3d.lodLabel}: {lodTier}
        </div>
      </Html>
    </group>
  )
}
