'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import {
  composeSegmentInstanceMatrices,
  generateRunStirrupSegments,
  generateWallLongitudinalRebarInstances,
} from '@ai-home-designer/bim-engine'
import { fetchWallReinforcement } from '@/hooks/useProjects'
import type { House } from '@/store/project.store'

/**
 * One instance pool per floor (all reinforcement steel shares one material/
 * geometry — a unit cylinder — so draw calls stay bounded like the brick
 * pools). Bar diameter/length live in the per-instance matrices.
 */
export interface RebarPool {
  key: string
  floor: number
  count: number
  matrices: Float32Array
}

export interface RebarInstancesState {
  pools: RebarPool[]
  /** Walls that actually have bars/stirrups to show. */
  rebarWallIds: Set<string>
  computing: boolean
  totalBars: number
  /** Closed stirrup loops across all walls (each rendered as 4 segments). */
  totalStirrups: number
}

const EMPTY_STATE: RebarInstancesState = {
  pools: [],
  rebarWallIds: new Set(),
  computing: false,
  totalBars: 0,
  totalStirrups: 0,
}

/**
 * Computes rebar instance matrices for every wall that has ReinforcementSpec
 * rows: LONGITUDINAL bars as straight cylinders, STIRRUP specs as closed
 * loops around the wall cross-section (4 segments each — step 9).
 * Bar counts are a few per wall, so composition runs on the main thread; the
 * heavy path (bricks) keeps its Web Worker. Same activation latch as
 * useBrickInstances: once detail tier has been requested, data stays warm.
 */
export function useRebarInstances(house: House | null, active: boolean): RebarInstancesState {
  const [activated, setActivated] = useState(false)
  useEffect(() => {
    if (active) setActivated(true)
  }, [active])

  const walls = useMemo(() => house?.walls ?? [], [house])

  const reinforcementQueries = useQueries({
    queries: walls.map((wall) => ({
      queryKey: ['wall-reinforcement', wall.id],
      queryFn: () => fetchWallReinforcement(wall.id),
      enabled: activated,
      staleTime: 5 * 60 * 1000,
    })),
  })
  const loading = activated && reinforcementQueries.some((q) => q.isLoading)

  return useMemo(() => {
    if (!activated) return EMPTY_STATE

    const perFloor = new Map<number, { count: number; buffers: Float32Array[] }>()
    const rebarWallIds = new Set<string>()
    let totalBars = 0
    let totalStirrups = 0

    walls.forEach((wall, i) => {
      const specs = reinforcementQueries[i]?.data
      if (!specs) return
      const addToPool = (count: number, matrices: Float32Array) => {
        if (count === 0) return
        rebarWallIds.add(wall.id)
        const pool = perFloor.get(wall.floor) ?? { count: 0, buffers: [] }
        pool.count += count
        pool.buffers.push(matrices)
        perFloor.set(wall.floor, pool)
      }
      for (const spec of specs) {
        if (spec.role === 'LONGITUDINAL') {
          const { count, matrices } = generateWallLongitudinalRebarInstances(
            {
              startXMm: wall.startX * 1000,
              startZMm: wall.startY * 1000,
              endXMm: wall.endX * 1000,
              endZMm: wall.endY * 1000,
              baseYMm: 0,
              heightMm: wall.height * 1000,
              thicknessMm: wall.thickness * 1000,
            },
            {
              diameterMm: spec.barDiameterMm,
              spacingMm: spec.spacingMm,
              coverMm: spec.coverMm,
              role: spec.role,
            },
          )
          totalBars += count
          addToPool(count, matrices)
        } else if (spec.role === 'STIRRUP') {
          // Closed loops confining the wall's cross-section, every spacing
          // along the run (step 9) — 4 straight segments per loop.
          const segments = generateRunStirrupSegments(
            {
              startXMm: wall.startX * 1000,
              startZMm: wall.startY * 1000,
              endXMm: wall.endX * 1000,
              endZMm: wall.endY * 1000,
              baseYMm: 0,
              heightMm: wall.height * 1000,
              widthMm: wall.thickness * 1000,
            },
            {
              diameterMm: spec.barDiameterMm,
              spacingMm: spec.spacingMm,
              coverMm: spec.coverMm,
            },
          )
          const { count, matrices } = composeSegmentInstanceMatrices(segments)
          totalStirrups += segments.length / 4
          addToPool(count, matrices)
        }
      }
    })

    const pools: RebarPool[] = []
    for (const [floor, { count, buffers }] of perFloor) {
      const matrices = new Float32Array(count * 16)
      let offset = 0
      for (const buffer of buffers) {
        matrices.set(buffer, offset)
        offset += buffer.length
      }
      pools.push({ key: `rebar|${floor}`, floor, count, matrices })
    }

    return { pools, rebarWallIds, computing: loading, totalBars, totalStirrups }
    // reinforcementQueries is a new array each render; depend on the data references.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activated, walls, loading, ...reinforcementQueries.map((q) => q.data)])
}
