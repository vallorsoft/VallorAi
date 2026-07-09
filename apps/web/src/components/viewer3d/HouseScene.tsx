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
import { RebarInstances } from './RebarInstances'
import { useRebarInstances } from './useRebarInstances'
import { StructuralConcrete } from './StructuralConcrete'
import { useStructuralInstances } from './useStructuralInstances'
import { useLOD } from './useLOD'

/**
 * Vertical distance between floor levels in the stacked 3D view. Matches
 * Wall.height's schema default (2.7m) — a rendering constant for the
 * placeholder stacking, not a structural storey-height spec (there is no
 * per-floor slab/storey model yet).
 */
const LEVEL_HEIGHT_M = 2.7

const floorElevation = (floor: number) => floor * LEVEL_HEIGHT_M

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
  // Stable per-wall opening arrays — the FPS readout re-renders this scene
  // twice a second, and an inline filter() would hand every WallMesh a fresh
  // array each time, defeating its memoization.
  const openingsByWall = useMemo(() => {
    const map = new Map<string, NonNullable<House['openings']>>()
    for (const opening of house.openings ?? []) {
      const list = map.get(opening.wallId) ?? []
      list.push(opening)
      map.set(opening.wallId, list)
    }
    return map
  }, [house])
  const rawTier = useLOD()
  const lodTier = lowPerfMode && rawTier === 'detail' ? 'medium' : rawTier
  const fps = useFps()
  const { pools, brickWalls, computing, totalBricks } = useBrickInstances(
    house,
    lodTier === 'detail',
  )
  const showBricks = lodTier === 'detail' && !computing && pools.length > 0
  const rebar = useRebarInstances(house, lodTier === 'detail')
  const showRebar = lodTier === 'detail' && !rebar.computing && rebar.pools.length > 0
  const structural = useStructuralInstances(house, lodTier === 'detail')
  const showStructural =
    lodTier === 'detail' && !structural.computing && structural.concretePools.length > 0

  return (
    <group position={[-centerX, 0, -centerZ]}>
      {house.rooms.map((room) => (
        <RoomFloor key={room.id} room={room} elevationY={floorElevation(room.floor)} />
      ))}
      {house.walls.map((wall) => {
        const brickInfo = showBricks ? brickWalls.get(wall.id) : undefined
        return (
          <WallMesh
            key={wall.id}
            wall={wall}
            elevationY={floorElevation(wall.floor)}
            openings={openingsByWall.get(wall.id)}
            mortarCoreWidthM={brickInfo?.brickWidthM}
            // Rebar sits inside the element — the abstract box goes
            // translucent (BIM rebar-view convention) so the bars read.
            translucent={showRebar && !brickInfo && rebar.rebarWallIds.has(wall.id)}
          />
        )
      })}
      {/* Instance matrices are composed wall-local with base y=0 (per floor
          pool) — lift each pool to its floor's level here. */}
      {showBricks &&
        pools.map((pool) => (
          <group key={pool.key} position-y={floorElevation(pool.floor)}>
            <BrickInstances pool={pool} />
          </group>
        ))}
      {showRebar &&
        rebar.pools.map((pool) => (
          <group key={pool.key} position-y={floorElevation(pool.floor)}>
            <RebarInstances pool={pool} />
          </group>
        ))}
      {showStructural &&
        structural.steelPools.map((pool) => (
          <group key={pool.key} position-y={floorElevation(pool.floor)}>
            <RebarInstances pool={pool} />
          </group>
        ))}
      {/* Translucent concrete renders after the steel so the cages inside
          blend through it. */}
      {showStructural &&
        structural.concretePools.map((pool) => (
          <group key={pool.key} position-y={floorElevation(pool.floor)}>
            <StructuralConcrete pool={pool} />
          </group>
        ))}
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
          {showRebar && rebar.totalBars > 0 && (
            <>
              {' '}
              · {t.editor.viewer3d.rebarCountLabel}: {rebar.totalBars.toLocaleString()}
            </>
          )}
          {(showRebar || showStructural) &&
            rebar.totalStirrups + structural.stirrupCount > 0 && (
              <>
                {' '}
                · {t.editor.viewer3d.stirrupCountLabel}:{' '}
                {(rebar.totalStirrups + structural.stirrupCount).toLocaleString()}
              </>
            )}
          {showStructural && structural.tieColumnCount > 0 && (
            <>
              {' '}
              · {t.editor.viewer3d.tieColumnCountLabel}: {structural.tieColumnCount.toLocaleString()}
            </>
          )}
          {showStructural && structural.centuraCount > 0 && (
            <>
              {' '}
              · {t.editor.viewer3d.centuraCountLabel}: {structural.centuraCount.toLocaleString()}
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
