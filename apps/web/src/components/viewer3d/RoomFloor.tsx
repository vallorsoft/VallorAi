'use client'

import type { Room } from '@/store/project.store'

// Visualization-only floor slab thickness for the 3D preview — not a
// structural spec value, so Key Rule 7 (standards-traced BIM defaults)
// doesn't apply here; it's a rendering constant, like the 2D canvas's grid
// stroke widths.
const FLOOR_RENDER_THICKNESS_M = 0.1

const ROOM_COLORS: Record<string, string> = {
  LIVING_ROOM: '#dbeafe',
  BEDROOM: '#fae8ff',
  MASTER_BEDROOM: '#ede9fe',
  KITCHEN: '#fef9c3',
  BATHROOM: '#dcfce7',
  TOILET: '#d1fae5',
  CORRIDOR: '#f3f4f6',
  DEFAULT: '#f0f9ff',
}

export function RoomFloor({ room, elevationY = 0 }: { room: Room; elevationY?: number }) {
  const x0 = room.posX ?? 0
  const y0 = room.posY ?? 0
  const width = room.width
  const depth = room.area / room.width
  const color = ROOM_COLORS[room.type] ?? ROOM_COLORS.DEFAULT

  if (!Number.isFinite(width) || !Number.isFinite(depth) || width <= 0 || depth <= 0) return null

  return (
    <mesh position={[x0 + width / 2, elevationY - FLOOR_RENDER_THICKNESS_M / 2, y0 + depth / 2]}>
      <boxGeometry args={[width, FLOOR_RENDER_THICKNESS_M, depth]} />
      <meshStandardMaterial color={color} />
    </mesh>
  )
}
