'use client'

import { useMemo } from 'react'
import type { Opening, Wall } from '@/store/project.store'

const EXTERIOR_COLOR = '#94a3b8'
const INTERIOR_COLOR = '#e2e8f0'
// Masonry mortar tone — shows through the bed joints (12mm per NE 001/1996 /
// P2-85) between brick courses when the brick instances are overlaid.
const MORTAR_COLOR = '#b3aa99'

interface WallMeshProps {
  wall: Wall
  /** Base height of the wall's floor level in the stacked 3D view (m). */
  elevationY?: number
  /** Door/window holes on this wall (wall-local meters — see store Opening). */
  openings?: Opening[]
  /**
   * When set (brick detail mode), the wall renders as a slightly-inset
   * mortar-colored core instead of the full abstract box: the brick instances
   * carry the visible faces, and this core fills the joint gaps between them.
   * Value = the brick block's through-thickness width in meters.
   */
  mortarCoreWidthM?: number
  /**
   * Reinforcement view (detail tier, wall has rebar instances): the abstract
   * box turns see-through so the bars inside it read — the usual BIM
   * convention for showing reinforcement inside concrete.
   */
  translucent?: boolean
}

/** An axis-aligned sub-rectangle of the wall strip, wall-local meters. */
interface WallPatch {
  u0: number
  u1: number
  y0: number
  y1: number
}

/**
 * Subtract the opening rectangles from the wall strip: full-height patches
 * beside/between openings, plus under-sill and over-head strips across each
 * opening — the same decomposition the brick coursing uses, so the mortar
 * core never shows through a door/window hole.
 */
function subtractOpenings(lengthM: number, heightM: number, openings: Opening[]): WallPatch[] {
  const holes = openings
    .map((o) => ({
      u0: Math.max(0, o.position),
      u1: Math.min(lengthM, o.position + o.width),
      y0: Math.max(0, o.sillHeight),
      y1: Math.min(heightM, o.sillHeight + o.height),
    }))
    .filter((h) => h.u1 - h.u0 > 0.001 && h.y1 - h.y0 > 0.001)
    .sort((a, b) => a.u0 - b.u0)

  if (holes.length === 0) return [{ u0: 0, u1: lengthM, y0: 0, y1: heightM }]

  const patches: WallPatch[] = []
  let cursor = 0
  for (const hole of holes) {
    if (hole.u0 - cursor > 0.001) {
      patches.push({ u0: cursor, u1: hole.u0, y0: 0, y1: heightM })
    }
    if (hole.y0 > 0.001) patches.push({ u0: hole.u0, u1: hole.u1, y0: 0, y1: hole.y0 })
    if (heightM - hole.y1 > 0.001) patches.push({ u0: hole.u0, u1: hole.u1, y0: hole.y1, y1: heightM })
    cursor = Math.max(cursor, hole.u1)
  }
  if (lengthM - cursor > 0.001) patches.push({ u0: cursor, u1: lengthM, y0: 0, y1: heightM })
  return patches
}

export function WallMesh({
  wall,
  elevationY = 0,
  openings = [],
  mortarCoreWidthM,
  translucent = false,
}: WallMeshProps) {
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

  const patches = useMemo(
    () => (mortarCoreWidthM !== undefined ? subtractOpenings(length, wall.height, openings) : []),
    [mortarCoreWidthM, length, wall.height, openings],
  )

  if (length === 0) return null

  if (mortarCoreWidthM !== undefined) {
    // Inset the core inside the brick envelope so only the joint gaps reveal
    // it — no z-fighting with the instanced brick faces.
    const coreThickness = Math.max(0.05, Math.min(wall.thickness, mortarCoreWidthM) - 0.02)
    return (
      <group position={[centerX, elevationY, centerZ]} rotation={[0, rotationY, 0]}>
        {patches.map((p, i) => (
          <mesh
            key={i}
            position={[(p.u0 + p.u1) / 2 - length / 2, (p.y0 + p.y1) / 2, 0]}
          >
            <boxGeometry
              args={[
                Math.max(0.02, p.u1 - p.u0 - 0.01),
                Math.max(0.02, p.y1 - p.y0 - 0.005),
                coreThickness,
              ]}
            />
            <meshLambertMaterial color={MORTAR_COLOR} />
          </mesh>
        ))}
      </group>
    )
  }

  return (
    <mesh position={[centerX, elevationY + wall.height / 2, centerZ]} rotation={[0, rotationY, 0]}>
      <boxGeometry args={[length, wall.height, wall.thickness]} />
      <meshStandardMaterial
        color={wall.isExterior ? EXTERIOR_COLOR : INTERIOR_COLOR}
        transparent={translucent}
        opacity={translucent ? 0.35 : 1}
        depthWrite={!translucent}
      />
    </mesh>
  )
}
