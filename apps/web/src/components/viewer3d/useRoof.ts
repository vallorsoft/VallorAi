'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { House } from '@/store/project.store'

export interface RoofData {
  id: string
  type: 'GABLED' | 'HIPPED' | 'FLAT' | 'MONOSLOPE'
  pitchDeg: number
  overhangM: number
  ridgeHeightM: number
  pitchVerified: boolean
  overhangVerified: boolean
}

/**
 * Fetches the house's roof (auto-provisioned by the API on first read). Reads
 * once per houseId and never on an unset id — the 3D viewer refetches on the
 * house change that comes back from any solveAndRegenerate round.
 */
export function useRoof(houseId: string | null | undefined) {
  return useQuery({
    queryKey: ['roof', houseId],
    queryFn: async () => {
      const res = await api.get(`/houses/${houseId}/roof`)
      return res.data as RoofData
    },
    enabled: !!houseId,
    staleTime: 60_000,
  })
}

/**
 * The bounding box of the topmost floor's exterior walls, in world (plan)
 * coordinates. Falls back to the whole-house bounds when no walls have been
 * generated yet (a house with only rooms — the pre-solver state).
 */
export function useRoofFootprint(house: House | null | undefined): {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  topFloor: number
} | null {
  if (!house) return null
  const topFloor = house.walls.reduce((max, w) => Math.max(max, w.floor), 0)
  const walls = house.walls.filter((w) => w.floor === topFloor && w.isExterior)
  const src = walls.length > 0 ? walls : house.walls
  if (src.length === 0) return null
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const w of src) {
    minX = Math.min(minX, w.startX, w.endX)
    maxX = Math.max(maxX, w.startX, w.endX)
    minZ = Math.min(minZ, w.startY, w.endY)
    maxZ = Math.max(maxZ, w.startY, w.endY)
  }
  return { minX, maxX, minZ, maxZ, topFloor }
}
