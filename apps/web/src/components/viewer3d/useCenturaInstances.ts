'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Matrix4, Vector3, Quaternion, Euler } from 'three'
import { fetchCenturi, type CenturaRow } from '@/hooks/useProjects'
import type { House } from '@/store/project.store'

const MM_PER_M = 1000

/**
 * One InstancedMesh per floor level — every centura (ring beam) is the same
 * unit box, scaled to `length × height × width` and rotated along its host
 * wall's direction by the per-instance matrix.
 */
export interface CenturaPool {
  key: string
  /** Centura's own `level` — the extra above-top-floor centura groups here. */
  level: number
  count: number
  matrices: Float32Array
}

export interface CenturaInstancesState {
  pools: CenturaPool[]
  computing: boolean
  totalCenturi: number
}

const EMPTY_STATE: CenturaInstancesState = {
  pools: [],
  computing: false,
  totalCenturi: 0,
}

/**
 * Fetches every centura on the house (auto-provisioned by the API — one per
 * load-bearing wall at its own floor level, plus one extra at the level
 * above the topmost floor, per CR6-2013). Produces per-level instance-matrix
 * pools for their concrete beam bodies.
 *
 * Positioning: each beam is a unit box scaled to
 * `wallLengthM × heightMm/1000 × widthMm/1000`, rotated so its long axis
 * matches the wall's `atan2(dz, dx)` direction (same convention WallMesh
 * uses), and lifted so its TOP sits at the top of the wall run — i.e. the
 * beam extends downward from the wall's top plate by its own heightMm. The
 * pool is keyed by centura level, and HouseScene lifts each pool to
 * `level × LEVEL_HEIGHT_M` — so with wall.height = LEVEL_HEIGHT_M (the
 * schema default), the beam's top ends up at `(level+1) × LEVEL_HEIGHT_M` in
 * absolute coords, exactly on top of its host wall.
 */
export function useCenturaInstances(
  house: House | null,
  active: boolean,
): CenturaInstancesState {
  const [activated, setActivated] = useState(false)
  useEffect(() => {
    if (active) setActivated(true)
  }, [active])

  const houseId = house?.id ?? null
  const wallsById = useMemo(() => {
    const map = new Map<string, House['walls'][number]>()
    for (const wall of house?.walls ?? []) map.set(wall.id, wall)
    return map
  }, [house])

  const query = useQuery<CenturaRow[]>({
    queryKey: ['centuri', houseId],
    queryFn: () => fetchCenturi(houseId as string),
    enabled: activated && !!houseId,
    staleTime: 5 * 60 * 1000,
  })
  const loading = activated && query.isLoading

  return useMemo(() => {
    if (!activated) return EMPTY_STATE

    const perLevel = new Map<number, { count: number; matrices: number[] }>()
    let totalCenturi = 0

    const scratchMatrix = new Matrix4()
    const scratchPos = new Vector3()
    const scratchScale = new Vector3()
    const scratchEuler = new Euler(0, 0, 0)
    const scratchQuat = new Quaternion()

    for (const centura of query.data ?? []) {
      const wall = wallsById.get(centura.wallId)
      if (!wall) continue
      const dx = wall.endX - wall.startX
      const dz = wall.endY - wall.startY
      const wallLengthM = Math.hypot(dx, dz)
      if (wallLengthM === 0) continue

      const heightM = centura.heightMm / MM_PER_M
      const widthM = centura.widthMm / MM_PER_M

      // Center of the beam in the pool's own frame: XZ at the wall's midpoint,
      // Y so the beam's top sits at the top of the wall run (wall.height above
      // the pool's baseline).
      const cx = (wall.startX + wall.endX) / 2
      const cz = (wall.startY + wall.endY) / 2
      const cy = wall.height - heightM / 2

      scratchPos.set(cx, cy, cz)
      scratchScale.set(wallLengthM, heightM, widthM)
      // Match WallMesh's rotationY = -atan2(dz, dx).
      scratchEuler.set(0, -Math.atan2(dz, dx), 0)
      scratchQuat.setFromEuler(scratchEuler)
      scratchMatrix.compose(scratchPos, scratchQuat, scratchScale)

      const pool = perLevel.get(centura.level) ?? { count: 0, matrices: [] }
      for (let i = 0; i < 16; i++) pool.matrices.push(scratchMatrix.elements[i])
      pool.count += 1
      perLevel.set(centura.level, pool)
      totalCenturi += 1
    }

    const pools: CenturaPool[] = []
    for (const [level, { count, matrices }] of perLevel) {
      pools.push({
        key: `centura|${level}`,
        level,
        count,
        matrices: new Float32Array(matrices),
      })
    }

    return { pools, computing: loading, totalCenturi }
  }, [activated, query.data, wallsById, loading])
}
