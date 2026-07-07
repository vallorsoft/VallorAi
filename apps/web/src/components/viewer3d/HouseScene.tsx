'use client'

import { useMemo } from 'react'
import { Html } from '@react-three/drei'
import type { House } from '@/store/project.store'
import { useTranslation } from '@/lib/useTranslation'
import { WallMesh } from './WallMesh'
import { RoomFloor } from './RoomFloor'
import { BrickInstances } from './BrickInstances'
import { useBrickInstances } from './useBrickInstances'
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
  const { centerX, centerZ } = useMemo(() => houseBounds(house), [house])
  const lodTier = useLOD()
  const { pools, brickWalls, computing, totalBricks } = useBrickInstances(
    house,
    lodTier === 'detail',
  )
  const showBricks = lodTier === 'detail' && !computing && pools.length > 0

  return (
    <group position={[-centerX, 0, -centerZ]}>
      {house.rooms.map((room) => (
        <RoomFloor key={room.id} room={room} />
      ))}
      {house.walls.map((wall) => {
        const brickInfo = showBricks ? brickWalls.get(wall.id) : undefined
        return <WallMesh key={wall.id} wall={wall} mortarCoreWidthM={brickInfo?.brickWidthM} />
      })}
      {showBricks && pools.map((pool) => <BrickInstances key={pool.key} pool={pool} />)}
      <Html fullscreen>
        <div className="absolute top-3 right-3 rounded-md bg-white/90 px-2.5 py-1 text-xs text-gray-500 shadow-sm pointer-events-none">
          {t.editor.viewer3d.lodLabel}: {lodTier}
          {lodTier === 'detail' && computing && <> · {t.editor.viewer3d.masonryComputing}</>}
          {showBricks && (
            <>
              {' '}
              · {t.editor.viewer3d.brickCountLabel}: {totalBricks.toLocaleString()}
            </>
          )}
        </div>
      </Html>
    </group>
  )
}
