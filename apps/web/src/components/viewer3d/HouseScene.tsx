'use client'

import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
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

/** Rolling FPS readout for the debug overlay, refreshed every half second. */
function useFps(): number | null {
  const [fps, setFps] = useState<number | null>(null)
  const frames = useRef(0)
  const windowStart = useRef(0)

  useFrame(() => {
    const now = performance.now()
    if (windowStart.current === 0) windowStart.current = now
    frames.current++
    const elapsed = now - windowStart.current
    if (elapsed >= 500) {
      setFps(Math.round((frames.current / elapsed) * 1000))
      frames.current = 0
      windowStart.current = now
    }
  })

  return fps
}

interface HouseSceneProps {
  house: House
  /**
   * Set when the browser has no hardware acceleration (or frame rate
   * collapsed) — the brick-detail tier is withheld so the view stays fluid,
   * and the overlay explains why.
   */
  lowPerfMode?: boolean
}

export function HouseScene({ house, lowPerfMode = false }: HouseSceneProps) {
  const { t } = useTranslation()
  const { centerX, centerZ } = useMemo(() => houseBounds(house), [house])
  const rawTier = useLOD()
  const lodTier = lowPerfMode && rawTier === 'detail' ? 'medium' : rawTier
  const fps = useFps()
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
          {fps !== null && <> · {t.editor.viewer3d.fpsLabel}: {fps}</>}
          {lodTier === 'detail' && computing && <> · {t.editor.viewer3d.masonryComputing}</>}
          {showBricks && (
            <>
              {' '}
              · {t.editor.viewer3d.brickCountLabel}: {totalBricks.toLocaleString()}
            </>
          )}
          {lowPerfMode && (
            <div className="mt-0.5 text-amber-600">{t.editor.viewer3d.lowPerfNotice}</div>
          )}
        </div>
      </Html>
    </group>
  )
}
